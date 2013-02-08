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