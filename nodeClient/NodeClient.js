/**
 * User: sinica
 * Date: 7/10/12
 * Time: 5:03 PM
 */

/*
 Utilities class for testing and for connecting from node.js processes
 */


/*
make swarmHub global variable available (for the last client open only, usually enough ..)
*/

require("./SwarmHub.js");
var tcpUtil = require("../lib/TCPSockUtil.js");
var debug   = require("../lib/SwarmDebug.js");
var uuid    = require('node-uuid');
thisAdapter.nodeName = "Client";

var net = require("net");

var sys = require('util'),
    events = require('events');

/**
 * Create  a SwarmClient
 * @param host
 * @param port
 * @param user
 * @param pass
 * @param tenantId
 * @return {SwarmClient}
 */

exports.createClient = function(host, port, user, pass, tenantId, ctor) {
    var client = new SwarmClient(host, port, user, pass, tenantId, ctor);
    swarmHub.resetConnection(client);
    return client;
}

/**
 *  Create a socket and wrap it as a swarm client providing login, startSwarm,etc
 * @param host
 * @param port
 * @param user
 * @param pass
 * @param tenantId
 * @constructor
 */

function SwarmClient ( host, port, user, pass, tenantId, loginCtor) {
    this.cmdParser  = tcpUtil.createFastParser(this.resolveMessage.bind(this));
    this.user = user;
    this.pass = pass;
    this.tenantId = tenantId;
    this.pendingCmds = [];
    if(!loginCtor){
        loginCtor = "authenticate";
    }
    this.loginCtor = loginCtor;

    this.getSessionId = function(){
        return this.sessionId;
    }

    this.onPhase = function(swarm, phaseName, callBack){

    }



    var self = this;
    var recconectionAttempts = 0;

    openConnection();
        
    function openConnection() {
        if(self.pendingCmds===null && recconectionAttempts===0) {
            //on the first recconection attempt start queueing the commands
            self.pendingCmds = [];
        }
        
        recconectionAttempts++;
        self.sock       =  net.createConnection(port, host);
        self.sock.removeAllListeners();
        self.sock.setEncoding("UTF8");
        self.sock.addListener("connect", function (data) {
            var cmd = {
                meta: {
                    swarmingName: 'login.js',
                    command: 'getIdentity',
                    ctor: 'authenticate'
                }
            };
            recconectionAttempts = 0;
            tcpUtil.writeObject(self.sock, cmd);
            self.emit("open", self);
        }.bind(self));

        self.sock.addListener("data", function (data) {
            self.cmdParser.parseNewData(data);
        }.bind(self));

        self.sock.addListener("close", function (data) {
            var timeout = Math.pow(2, recconectionAttempts);
            var maxTimeout = 60000; //try a recconection every minute
            setTimeout(openConnection,(timeout<maxTimeout)?timeout:maxTimeout);
        }.bind(self));


        self.sock.addListener("end", function (data) {
            console.log("Swarm connection ended...\nAttempting recconection");
            self.emit("close", self);
            openConnection();
        }.bind(self));

        self.sock.addListener("error", function (data) {
            //console.log("Error"); ---- this error should be logged somewhere
        }.bind(self));
    }
}

sys.inherits(SwarmClient, events.EventEmitter);

/**
 *
 * @param swarmName
 * @param constructor
 */

var internalCallbacks = {};
SwarmClient.prototype.startSwarm = function (swarmName, constructor) {
    var args = Array.prototype.slice.call(arguments,2);
    var cmd = {
        meta                    : {
            sessionId           : this.sessionId,
            outletId            : this.outletId,
            tenantId            : this.tenantId,
            userId              : this.user,
            swarmId             : uuid.v1(),
            swarmingName        : swarmName,
            command             : "start",
            ctor                : constructor,
            commandArguments    : args
        }
    };

    cmd.onResponse = function(callback){
        if(!internalCallbacks[cmd.meta.swarmId]){
            internalCallbacks[cmd.meta.swarmId] = []
        }
        internalCallbacks[cmd.meta.swarmId].push(callback);
    };

    if(this.pendingCmds == null) {
        tcpUtil.writeObject(this.sock,cmd);
    }
    else {
        dprint("Preserving pending command " + JSON.stringify(cmd));
        this.pendingCmds.push(cmd);
    }
    return cmd;
};

/**
 *
 * @param remoteAdapter
 * @param swarmName
 * @param constructor
 */
SwarmClient.prototype.startRemoteSwarm = function (remoteAdapter, swarmName, constructor) {

    var args = []; // empty array
    // copy all other arguments we want to "pass through"
    for(var i = 3; i < arguments.length; i++){
        args.push(arguments[i]);
    }
    this.startSwarm("startRemoteSwarm.js","start", remoteAdapter, this.sessionId, swarmName, constructor, null, args);
};


//TODO: first time when we need it
/*
 SwarmClient.prototype.continueSwarm = function (cmd,swarmName, phase) {
 var args = Array.prototype.slice.call(arguments,2);
 var cmd = {
 sessionId        : this.sessionId,
 tenantId         : this.tenantId,
 swarmingName     : swarmName,
 command          : "phase",
 currentPhase     : phase
 };
 util.writeObject(this.sock,cmd);
 }
 }*/
/**
 *  internal function, dont't touch
 * @param object
 */

SwarmClient.prototype.resolveMessage = function (object) {
    dprint("Received:\n " + M(object));
    if(object.meta.changeSessionId == true){
        dprint("Renaming session " + this.sessionId + " to " + object.meta.sessionId);
        this.sessionId  = object.meta.sessionId;
    }

    if(object.meta.command == "identity"){
        this.sessionId  = object.meta.sessionId;
        this.outletId   = object.meta.outletId;
        this.login(object.meta.sessionId, this.user, this.pass);
    }

    else {
        if(internalCallbacks[object.meta.swarmId]) {
            internalCallbacks[object.meta.swarmId].forEach(function(callback){
                callback(object);
            });
        }

        if (this.pendingCmds == null) {
            this.emit(object.meta.swarmingName, object);
        }
        else {
            this.loginOk = true;
            this.emit(object.meta.swarmingName, object); //if was not closed,it should be a successful login
            for (var i = 0; i < this.pendingCmds.length; i++) {
                this.pendingCmds[i].meta.sessionId = this.sessionId;
                dprint("Writing pending command " + J(this.pendingCmds[i]));
                tcpUtil.writeObject(this.sock, this.pendingCmds[i]);
            }
            this.pendingCmds = null;
        }
    }
};

/**
 *
 * @param sessionId
 * @param user
 * @param pass
 */
SwarmClient.prototype.login = function (sessionId,user,pass) {
    var cmd = {
        meta                :{
            sessionId           : sessionId,
            tenantId            : this.tenantId,
            swarmingName        : "login.js",
            command             : "start",
            ctor                : this.loginCtor,
            commandArguments    : [sessionId, user, pass]
        }
    };

    tcpUtil.writeObject(this.sock,cmd);
}


/**
 *
 * @param sessionId
 * @param user
 * @param pass
 */
SwarmClient.prototype.logout = function () {
    this.sock.end();
}