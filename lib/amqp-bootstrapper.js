/*
 amqp-bootstrapper
 © 2012 - Copyright appendTo, LLC
 Author(s): Jim Cowart
 License: Dual licensed MIT (http://opensource.org/licenses/MIT) & GPL (http://opensource.org/licenses/GPL-2.0)
 Version 0.0.1
 */
module.exports = function(_, machina, Monologue, amqp) {
	/*global machina*/
	var ConstraintFsm = machina.Fsm.extend( _.extend( {
		checkIfReady : function () {
			if ( this.constraints[this.state] && this.constraints[this.state].hasOwnProperty( "nextState" ) ) {
				if ( !this.constraints[this.state].hasOwnProperty( "checkList" ) ||
				     (this.constraints[this.state].hasOwnProperty( "checkList" ) &&
				      _.all( this.constraints[this.state].checkList, function ( constraint ) {
					      return constraint;
				      } )) ) {
					this.transition( this.constraints[this.state].nextState );
				}
			}
		},
	
		markConstraint : function ( constraint ) {
			var status = arguments[1] || true;
			if ( !this.constraints[this.state] ) {
				this.constraints[this.state] = {};
			}
			if ( !this.constraints[this.state].checkList ) {
				this.constraints[this.state].checkList = {};
			}
			this.constraints[this.state].checkList[constraint] = status;
		},
	
		constraints : {}
	}, Monologue.prototype ) );
	/*global _,amqp*/
	var getDefaults = function() {
		return {
			queues        : {},
			exchanges     : {},
			subscriptions : {},
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
	
		"*" : function() {
			this.deferUntilTransition();
		},
	
		states: {
			uninitialized: {
				start : function() {
					var self = this;
					// set up constraints for queues and exchanges
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
							self.markConstraint(exch.name);
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
							self.markConstraint(name);
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
							self.queues[qName].bind(exchangeName, routingKey);
							self.markConstraint(exchangeName);
							self.checkIfReady();
						});
					});
				}
			},
			ready: {
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

	return Bootstrapper;
};