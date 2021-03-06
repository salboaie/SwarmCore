 var go      = require('../../lib/GenericOutlet.js');
var tranrest = require('transrest')
var swarmDispatcher =  require("../../lib/SwarmDispatcher.js");
//global sessionsRegistry object
sessionsRegistry  = require("../../lib/SessionRegistry.js").getRegistry();
globalVerbosity = true;

var serverSocketAvailable = true;

thisAdapter = require ("../../lib/SwarmCore.js").createAdapter("WSServer");

thisAdapter.loginSwarmingName = "login.js";
thisAdapter.joinGroup("@ClientAdapters");

/* for monitoring*/
var socketDetails = "";

/*
 *  enable outlet for other swarms
 */
enableOutlet = function(swarm){
    var outlet = sessionsRegistry.getTemporarily(swarm.meta.outletId);
    outlet.successfulLogin(swarm);
}


thisAdapter.nativeMiddleware.registerHomeSwarmHandler(function(swarm){
        var outlet = sessionsRegistry.findOutletById(swarm.meta.outletId);
        outlet.onHoney(swarm);
    }
)

/*
 *  disable outlet for other swarms
 */
disableOutlet = function(swarm){
    var outlet = sessionsRegistry.findOutletById(swarm.meta.outletId);
    outlet.destroy(outlet);
}

 getSwarmDispatcher = function(){
     return swarmDispatcher;
}


function sendFunction(socket, data) {
    dprint("Sending: " + M(data));
    socket.send(data);
}

function closeFunction(socket) {
    try{
        console.log("Closing socket");
        socket.close();
        //socket.close();
    } catch (e) {
        console.log("Closing socket error:" + e);
    }
}

function watchSocket(socket, outlet) {
    socket.on('message', function (data) {
        //console.log(data);
        //data = JSON.parse(data);
        dprint("Received: " + M(data));
        outlet.executeFromSocket(data);
    });
}

/*
 Useful for monitoring this type of adapters
 */
adapterStateCheck = function (data) {
    return {
        ok: serverSocketAvailable,
        details: socketDetails,
        requireRestart: !serverSocketAvailable
    };
}


function socketIOHandler(socket) {
    cprint("Socket IO new socket");
    socket.getClientIp = function(){
        return socket.handshake.address;
    }

    var outlet = go.newOutlet(socket, sendFunction, closeFunction);

    socket.on('error', function(err){
        outlet.onCommunicationError(" receviving error"+err+ err.stack);
    });
    socket.on('close', function(){
        outlet.onCommunicationError(" socket closed ");
    });
    socket.on('disconnect', function(){
        outlet.onCommunicationError(" socket disconnect ");
    });

    watchSocket(socket, outlet);
    outlet.onHostReady();
}

var myCfg = getMyConfig("WSServer");
var serverPort = 8080;
var serverHost = "localhost";
var __wwwroot = "admin/public";

if (myCfg.host != undefined) {
    serverHost = myCfg.host;
}

if (myCfg.port != undefined) {
    serverPort = myCfg.port;
}

if (myCfg.wwwroot != undefined) {
    __wwwroot = myCfg.wwwroot;
}

/*     if (myCfg.bindAddress != undefined) {
            serverHost = myCfg.bindAddress;
            serverHost = serverHost.trim();
            if (serverHost.length == 0 || serverHost == '*') {
                serverHost = null;
            }
        }
*/



 var fs = require('fs');
 var app = undefined;
 var app_connect = require('connect')()

 app_connect.use(generalServerHandler)


 try {
     httpsOptions = {
         key: fs.readFileSync(process.env.SWARM_PATH + "/" + myCfg.ssl.key),
         cert: fs.readFileSync(process.env.SWARM_PATH + "/" + myCfg.ssl.cert),
		 ca: fs.readFileSync(process.env.SWARM_PATH + "/" + myCfg.ssl.ca)
     };
     app = require('https').createServer(httpsOptions,app_connect);
 }catch(e){
     app = require('http').createServer(app_connect);
 }


 var io = require('socket.io')(app);
 app.listen(serverPort);
 io.on('connection', socketIOHandler);

 function generalServerHandler (req, res,next) {
     var resource = req.url;
     if(resource.indexOf("?") != -1){
         resource = resource.split("?")[0];
     }
     if (resource == "/") {
         resource = "/index.html";
     }
     fs.readFile(process.env.SWARM_PATH + "/" + __wwwroot + resource,
         function (err, data) {
             if(!err){
                res.writeHead(200);
                res.end(data);
             }else{
                 next()
             }
         });
 }



 if (myCfg.transformationDirs) {
    var allTransformations = {};
    var sequence = Promise.resolve();

    myCfg.transformationDirs.forEach(function (dir) {
        sequence = sequence.then(function () {
            return new Promise(function (resolve) {
                fs.readdir(process.env.SWARM_PATH + "/" + dir, function (err, transformations) {
                    transformations.forEach(function (file) {
                        var fileTransformations = require(process.env.SWARM_PATH + "/" + dir + "/" + file).transformations;
                        for (tranformationKey in fileTransformations) {
                            if (allTransformations[tranformationKey]) {
                                console.error("Transformation ", tranformationKey, "is already defined!");
                            }
                            else {
                                allTransformations[tranformationKey] = fileTransformations[tranformationKey];
                            }
                        }
                        resolve();

                    })
                });


            });
        });
    })

    sequence = sequence.then(function () {
        tranrest.restAPI(allTransformations, app_connect);
    })
}



 /* alternative implementtion
  function wssocketIOHandler(socket) {
  cprint("Socket IO new socket");
  socket.getClientIp = function(){
  return socket._socket.remoteAddress;
  return socket.upgradeReq.connection.remoteAddress;
  }

  var outlet = go.newOutlet(socket, sendFunction, closeFunction);

  socket.on('error', function(){
  outlet.onCommunicationError(" unknown error");
  });
  socket.on('close', function(){
  outlet.onCommunicationError(" socket closed ");
  });
  socket.on('disconnect', function(){
  outlet.onCommunicationError(" socket disconnect ");
  });

  watchSocket(socket, outlet);
  outlet.onHostReady();
  }
  */