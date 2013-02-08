require( "should" );
global.expect = require( "expect.js" );
_ = require('underscore');
var machina = require('machina')(_);
var Monologue = require('monologue.js')(_);
var amqp = require('amqp');
var Bootstrapper = require('../lib/amqp-bootstrapper.js')(_, machina, Monologue, amqp);

var bootstrapper = new Bootstrapper({
	connection : {
		host     : 'localhost',
		port     : 5672,
		login    : 'guest',
		password : 'guest',
		vhost    : '/'
	},
	queues : {
		"test-queue-name" : {
			options: {
				durable: false
			},
			bindings : {
				"test-exchange" : "bootstrapper.test.*"
			}
		}
	},
	exchanges : {
		"test-exchange" : {
			type    : "topic",
			durable : false
		}
	},
	routingKeys : {
		"bootstrapper.test.ping" : "test-exchange"
	}
});

var ready = false;
var queue = [];
var fsmReady = function(callback) {
	if(ready) {
		callback();
	} else {
		queue.push(callback);
	}
};

bootstrapper.on("ready", function(data, env){
	ready = true;
	queue.forEach(function(cb) {
		cb();
	});
});

describe("amqp-bootstrapper integration tests", function() {

	describe("before start is called", function() {
		it('should have an instance', function() {
			expect(bootstrapper).to.be.ok();
		});

		it('should start in uninitialized state', function() {
			expect(bootstrapper.state).to.be("uninitialized");
		});

		it('should have expected constraints for uninitialized', function() {
			expect(bootstrapper.constraints.uninitialized).to.be.ok();
			expect(bootstrapper.constraints.uninitialized).to.have.property("nextState");
			expect(bootstrapper.constraints.uninitialized.nextState ).to.be("connecting");
		});

		it('should have expected constraints for connecting', function() {
			expect(bootstrapper.constraints.connecting).to.be.ok();
			expect(bootstrapper.constraints.connecting).to.have.property("nextState");
			expect(bootstrapper.constraints.connecting.nextState ).to.be("exchangeInit");
		});

		it('should have expected constraints for exchangeInit', function() {
			expect(bootstrapper.constraints.exchangeInit).to.be.ok();
			expect(bootstrapper.constraints.exchangeInit).to.have.property("nextState");
			expect(bootstrapper.constraints.exchangeInit.nextState).to.be("queueInit");
			expect(bootstrapper.constraints.exchangeInit).to.have.property("checkList");
			expect(bootstrapper.constraints.exchangeInit.checkList).to.eql({});
		});

		it('should have expected constraints for queueInit', function() {
			expect(bootstrapper.constraints.queueInit).to.be.ok();
			expect(bootstrapper.constraints.queueInit).to.have.property("nextState");
			expect(bootstrapper.constraints.queueInit.nextState).to.be("queueBinding");
			expect(bootstrapper.constraints.exchangeInit).to.have.property("checkList");
			expect(bootstrapper.constraints.exchangeInit.checkList).to.eql({});
		});

		it('should have expected constraints for queueBinding', function() {
			expect(bootstrapper.constraints.queueBinding).to.be.ok();
			expect(bootstrapper.constraints.queueBinding).to.have.property("nextState");
			expect(bootstrapper.constraints.queueBinding.nextState ).to.be("ready");
			expect(bootstrapper.constraints.exchangeInit).to.have.property("checkList");
			expect(bootstrapper.constraints.exchangeInit.checkList).to.eql({});
		});
	});

	describe("once started", function() {
		before(function(done){
			bootstrapper.start();
			fsmReady(done);
		});

		it('should have added constraints for exchangeInit', function() {
			expect(bootstrapper.constraints.exchangeInit.checkList).to.eql({ "test-exchange" : true });
		});

		it('should have added constraints for queueInit', function() {
			expect(bootstrapper.constraints.queueInit.checkList).to.eql({ "test-queue-name" : true });
		});

		it('should have added constraints for queueBinding', function() {
			expect(bootstrapper.constraints.queueBinding.checkList).to.eql({ "test-exchange" : true });
		});

		it('should have local queue results', function() {
			expect(bootstrapper.queues).to.have.property("test-queue-name");
			expect(bootstrapper.queues["test-queue-name"]).to.have.property("unsubscribe");
		});

		it('should have local exchanges results', function() {
			expect(bootstrapper.exchanges).to.have.property("test-exchange");
			expect(bootstrapper.exchanges["test-exchange"]).to.have.property("publish");
		});

		it('should have local subscriptions results', function() {
			expect(bootstrapper.subscriptions).to.have.property("test-queue-name");
			expect(typeof bootstrapper.subscriptions["test-queue-name"]).to.be("string");
		});

		it('should publish/receive when ready', function(done) {
			bootstrapper.on("bootstrapper.test.*", function(data, envelope){
				expect(data.message).to.eql({ foo: "bar", baz: "bacon" });
				done();
			});
			bootstrapper.publish("bootstrapper.test.ping", { foo: "bar", baz: "bacon" });
		});
	});
});