function stateTrace(obj) {
	if(typeof obj !== 'object') return;
	var sequence = [];
	var curIndex = -1;
	function pushLog(logobj) {
		if(curIndex !== sequence.length - 1) {
			sequence.splice(curIndex + 1,sequence.length);
		}
		sequence.push(logobj);
		curIndex = sequence.length - 1;
	}
	function Log(target,key,cmd,oldv,newv) {
		this.target = target;
		this.key = key;
		this.cmd = cmd;
		this.oldv = oldv;
		this.newv = newv;
	}
	Log.ADD = 'add';
	Log.DELETE = 'delete';
	Log.MODIFY = 'modify';
	
	async function transaction(f) {
		var tempSequence = sequence;
		var tempCurIndex = curIndex;
		sequence = [];
		curIndex = -1;
		var ret = false;
		try {
			if(Object.getPrototypeOf(f).constructor.name === 'AsyncFunction') {
				ret = await f();
			} else {
				ret = f();
			}
		} catch(_) {}
		if(ret === true) {
			var tranSequence = sequence;
			sequence = tempSequence;
			curIndex = tempCurIndex;
			pushLog(tranSequence);
		} else {
			backward(curIndex + 1);
			sequence = tempSequence;
			curIndex = tempCurIndex;
		}
	}
	function backward(num) {
		num = num || 1;
		while(num && curIndex >= -1) {
			var logObj = sequence[curIndex];
			if(logObj instanceof Array) {
				var tempSequence = sequence;
				var tempCurIndex = curIndex;
				sequence = logObj;
				curIndex = logObj.length - 1;
				backward(curIndex + 1);
				sequence = tempSequence;
				curIndex = tempCurIndex;
			} else if(logObj instanceof Log) {
				var cmd = logObj.cmd;
				if(cmd === Log.ADD) {
					delete logObj.target[logObj.key];
				} else if(cmd === Log.MODIFY) {
					if(logObj.target instanceof Array && logObj.key === null) {
						var val = logObj.oldv.concat([]);
						val.unshift(0,logObj.target.length);
						logObj.target.splice.apply(logObj.target,val);
					} else {
						logObj.target[logObj.key] = logObj.oldv;
					}
				} else if(cmd === Log.DELETE) {
					logObj.target[logObj.key] = logObj.oldv;
				}
			}
			curIndex--;
			num--;
		}
	}
	function forward(num) {
		num = num || 1;
		while(num && curIndex < sequence.length - 1) {
			curIndex++;
			var logObj = sequence[curIndex];
			if(logObj instanceof Array) {
				var tempSequence = sequence;
				var tempCurIndex = curIndex;
				sequence = logObj;
				curIndex = -1;
				forward(sequence.length);
				sequence = tempSequence;
				curIndex = tempCurIndex;
			} else if(logObj instanceof Log) {
				var cmd = logObj.cmd;
				if(cmd === Log.ADD) {
					logObj.target[logObj.key] = logObj.newv;
				} else if(cmd === Log.MODIFY) {
					if(logObj.target instanceof Array && logObj.key === null) {
						var val = logObj.newv.concat([]);
						val.unshift(0,logObj.target.length);
						logObj.target.splice.apply(logObj.target,val);
					} else {
						logObj.target[logObj.key] = logObj.newv;
					}
				} else if(cmd === Log.DELETE) {
					delete logObj.target[logObj.key];
				}
			}
			num--;
		}
	}
	var methodMap = {'transaction':transaction,'forward':forward,'backward':backward};
	
	var handler = {
		get: function(target, key, receiver) {
			if(target === obj && key in methodMap) {
				return methodMap[key];
			}
			if(target instanceof Array && typeof target[key] === 'function') {
				return function() {
					var oldval = target.concat([]);
					var ret = target[key].apply(target,arguments);
					var newval = target.concat([]);
					if(oldval.length !== target.length) {
						pushLog(new Log(target,null,Log.MODIFY,oldval,newval));
					} else {
						for(var i = 0,len = oldval.length;i < len;i++) {
							if(oldval[i] !==  target[i]) {
								pushLog(new Log(target,null,Log.MODIFY,oldval,newval));
								break;
							}
						}
					}
					return ret;
				}
			} else {
				return target[key];
			}
		},
		set: function(target, key, value, receiver) {
			if(typeof value === 'object') {
				value = wrap(value);
			}
			if(typeof Object.getOwnPropertyDescriptor(target,key) === 'undefined') {
				pushLog(new Log(target,key,Log.ADD,target[key],value));
			} else {
				pushLog(new Log(target,key,Log.MODIFY,target[key],value));
			}
			target[key] = value;
			return value;
		},
		defineProperty: function(target, key, descriptor) {
			return false;
		},
		deleteProperty: function(target, key) {
			var d = Object.getOwnPropertyDescriptor(target,key);
			if(typeof d !== 'undefined') {
				pushLog(new Log(target,key,Log.DELETE,target[key],undefined));
				delete target[key];
			}
			return true;
		}
	}
	function wrap(obj) {
		for(var k in obj) {
			if(typeof obj[k] === 'object') {
				obj[k] = wrap(obj[k]);
			}
		}
		return new Proxy(obj,handler);
	}
	
	return wrap(obj);
}