#amqp-bootstrapper v0.1.0

### What is it?
The amqp-bootstrapper module provides a finite state machine tailored for managing the setup process of exchanges, queues and bindings on a RabbitMQ broker. It wraps both publish and subscribe operations, allowing publishing to occur as the FSM still stands up the broker endpoint(s). Any publish calls that occur during intialization are immediately replayed as soon as the FSM transitions into the "ready" state.  In addition, the FSM's event emitter is based on [monologue.js](), so that any messages coming in from the broker are emitted as events, with the routingKey as the event topic (and monologue's binding rules allow you to bind using wildcards, etc. - matching AMQP sematics).

### Including it in Your Project
amqp-bootstrapper takes a dependency on [underscore](http://underscorejs.org/), [machina](https://github.com/ifandelse/machina.js), [monologue.js](https://github.com/postaljs/monologue.js) and [amqp](https://npmjs.org/package/amqp), and returns factory function that takes those modules as dependencies:

```javascript
_ = require('underscore');
var machina = require('machina')(_);
var Monologue = require('monologue.js')(_);
var amqp = require('amqp');
var Bootstrapper = require('amqp-bootstrapper.js')(_, machina, Monologue, amqp);
```

### Providing an AMQP Configuration
In order to have the bootstrapper manage your amqp setup, you have to pass a configuration object to the constructor that contains the connection, queues, bindings, exchanges and routing key metadata necessary:

```javascript
var bootstrapper = new Bootstrapper({
    // The connection data, as passed to the amqp.createConnection() call
	connection : {
		host     : 'localhost',
		port     : 5672,
		login    : 'guest',
		password : 'guest',
		vhost    : '/'
	},
	// queues contains the queue name (the key/member name) and each queue
	// contains options (which are passed to the connection.queue() call) as
	// well as "bindings" that list an exchange name (the key) and the binding
	// to use to bind to that exchange (value). The binding can be a string or
	// an array of strings.
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
	// exchanges contain exchange names (keys) and their options (value), 
	// which are passed to the connection.exchange() call
	exchanges : {
		"test-exchange" : {
			type    : "topic",
			durable : false
		}
	},
	// routingKeys contain a map of a routing key to the exchange on which it
	// should be published. This is used when publish is called, as the FSM will
	// look up the correct exchange on which to publish the message.
	routingKeys : {
		"bootstrapper.test.ping" : "test-exchange"
	}
});

```

### Caveats
This is a highly experimental effort, so expect the API to fluctuate for some time….
