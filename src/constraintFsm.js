/*global machina*/

/*
	The ConstraintFsm provides a simple means to create a "checkList" of items
	that need to be completed before the current state can transition to the
	next state. This works best for deterministic/bootstrapper scenarios, where
	the states are a simple one-direction workflow. It is not required for every
	state to have a constraints object, but if you use the "checkIfReady" function
	the current state will need to exist in the constraints member, and have a
	nextState string value at the very least.

	checkIfReady -> looks up the constraints object for the current state. If there
					are checkList items, and all of them are true, it transitions
					to the state named in the "nextState" value of the constraints.
					If no checkList items exist, the transition happens as well. If
					any of the checkList items are false, no transition occurs.

	markConstraint -> helper method for checking off checkList items. Pass the name of
					the checkList item and it will be flagged as done (true).

	NOTE: The built-in machina event emitter behavior has been replaced with Monologue.
 */
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