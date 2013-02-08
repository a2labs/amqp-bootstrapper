/*global _,amqp*/
var getDefaults = function() {
	return {
		// will hold references to amqp queue objects
		queues        : {},

		// will hold references to amqp exchange objects
		exchanges     : {},

		// will hold ctag values for each binding setup
		subscriptions : {},

		// baseline constraints for each state. The checkList(s)
		// will be populated as the FSM starts.
		constraints   : {
			uninitialized: {
				nextState: "connecting"
			},
			connecting : {
				nextState: "exchangeInit"
			},
			exchangeInit : {
				nextState: "queueInit",
				checkList: {}
			},
			queueInit : {
				nextState: "queueBinding",
				checkList: {}
			},
			queueBinding : {
				nextState: "ready",
				checkList: {}
			}
		}
	}
};

var Bootstrapper = ConstraintFsm.extend({

	initialState: "uninitialized",

	initialize : function(config) {
		_.extend(this, getDefaults(), { config: config });
	},

	start: function() {
		this.handle("start");
	},

	publish: function(routingKey, message, options, callback) {
		this.handle("publish", routingKey, message, options, callback);
	},

	// This is a top-level "catch-all" handler for any state that receives
	// an input event for which it doesn't have a named handler to invoke.
	// This means that publish calls can be happening while the FSM stands
	// all the rabbitmq pieces up, and the publishes will happen once the
	// FSM transitions into "ready".
	"*" : function() {
		this.deferUntilTransition();
	},

	states: {
		uninitialized: {
			start : function() {
				var self = this;
				// set up constraints for queues, bindings and exchanges
				_.each(self.config.exchanges || {}, function(exchange, name) {
					self.constraints.exchangeInit.checkList[name] = false;
				});
				_.each(self.config.queues || {}, function(queue, name) {
					self.constraints.queueInit.checkList[name] = false;
					_.each(queue.bindings || {}, function(routingKey, exchange){
						self.constraints.queueBinding.checkList[exchange] = false;
					});
				});
				this.checkIfReady();
			}
		},
		connecting: {
			_onEnter: function() {
				var self = this;
				self.conn = amqp.createConnection( self.config.connection );
				self.conn.on('ready', function onReady() {
					self.handle("rabbit.ready");
					self.conn.removeListener('ready', onReady);
				});
			},
			"rabbit.ready" : function() {
				this.checkIfReady();
			}
		},
		exchangeInit : {
			_onEnter : function() {
				var self = this;
				if(!self.config.exchanges) {
					self.checkIfReady();
				}
				_.each(self.config.exchanges, function(options, name) {
					self.conn.exchange(name, options, function(exch) {
						self.exchanges[name] = exch;
						self.markConstraint.call(self, exch.name);
						self.checkIfReady();
					});
				});
			}
		},
		queueInit : {
			_onEnter : function() {
				var self = this;
				if(!self.config.queues) {
					self.checkIfReady();
				}
				_.each(self.config.queues, function(qConfig, name) {
					self.conn.queue(name, qConfig.options, function(queue) {
						self.queues[name] = queue;
						queue.subscribe(function(message, headers, envelope) {
							self.handle("receive", message, headers, envelope);
						}).addCallback(function(ok) {
							self.subscriptions[name] = ok.consumerTag;
						 });
						self.markConstraint.call(self, name);
						self.checkIfReady();
					});
				});
			}
		},
		queueBinding : {
			_onEnter : function() {
				var self = this;
				if(!self.config.queues) {
					self.checkIfReady();
				}
				_.each(self.config.queues, function(qConfig, qName) {
					_.each(qConfig.bindings, function(routingKey, exchangeName){
						_.each(_.isArray(routingKey) ? routingKey : [ routingKey ], function(rKey) {
							self.queues[qName].bind(exchangeName, rKey);
						});
						self.markConstraint.call(self, exchangeName);
						self.checkIfReady();
					});
				});
			}
		},
		ready: {
			_onEnter: function() {
				this.emit('ready');
			},
			publish: function(routingKey, message, options, callback) {
				var exchange = this.exchanges[this.config.routingKeys[routingKey]];
				if(exchange) {
					exchange.publish(routingKey, message, options, callback);
				}
			},
			receive : function(message, headers, envelope) {
				this.emit(envelope.routingKey, {
					message  : message,
					headers  : headers,
					envelope : envelope
				});
			},
			tearDown: function() {
				var self = this;
				_.each(self.subscriptions, function(ctag, qName){
					self.queues[qName].unsubscribe(ctag);
				});
				self.connection.end();
			}
		}
	}
});