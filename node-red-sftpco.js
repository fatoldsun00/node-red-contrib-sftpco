
module.exports = function(RED) {
	//var SFTPCredentialsNode, SFTPNode;
	const Client = require('ssh2-sftp-client');
	const path = require('path')
	const fs = require('fs')

	function SFTPCredentialsNode(config) {
		RED.nodes.createNode(this,config)
		this.host = config.host
		this.port = config.port
		this.username = config.username
		this.password = config.password
	}

	function SFTPNode(config) {
		RED.nodes.createNode(this, config)
		let key,  value, node = this
		
		for (key in config) {
			value = config[key];
			node[key] = value;
		}

		node.server = RED.nodes.getNode(config.server);
		
		this.listenInput()
	}

	SFTPNode.prototype.listenInput = function (){
		let node = this
				
		node.on('input', async function(msg,send,done) {
			let sftp = new Client();
			try {				
				node.status({
					fill: "grey",
					shape: "dot",
					text: "connecting"
				});
	
// TO ENABLE CONSOLE DEBUGGING OF ssh2-sftp-client
//				await sftp.connect({ 
//					host: node.server.host,
//					port: node.server.port,
//					username: node.server.username,
//					password: node.server.password,
//					debug: console.info});
				await sftp.connect({ 
					host: node.server.host,
					port: node.server.port,
					username: node.server.username,
					password: node.server.password});
				
				node.status({
					fill: "yellow",
					shape: "ring",
					text: "connected"
				});
	
				let remoteFilePath, localFilePath, payload
				switch(node.method) {
					case "list":
						remoteFilePath = RED.util.evaluateNodeProperty(node.remoteFilePath,node.remoteFilePathType,node,msg)
						if (!remoteFilePath) throw new Error('Remote path undefined')
						payload = await sftp.list(remoteFilePath)
						msg.payload = payload.map((r)=>{	
							return remoteFilePath+"/"+r.name
						})
						send([msg,null])
					break;
							
					case "get":
						remoteFilePath = RED.util.evaluateNodeProperty(node.remoteFilePath,node.remoteFilePathType,node,msg)
						localFilePath = RED.util.evaluateNodeProperty(node.localFilePath,node.localFilePathType,node,msg)

						if (!remoteFilePath) throw new Error('Remote path undefined')
						if (!localFilePath) throw new Error('Local path undefined')

						let localFilePathIsDir = fs.statSync(localFilePath).isDirectory()

						if (Array.isArray(remoteFilePath)){
							payload=[]
							for(remotePath of remoteFilePath){
								let file = remotePath.substring(remotePath.lastIndexOf('/')+1)
								let localFile = localFilePath
								if (localFilePathIsDir) localFile = path.join(localFilePath,file)
								localFile=path.normalize(localFile)
								payload.push(await sftp.get(remotePath,localFile))
							}
						} else {
							let file = remoteFilePath.substring(remoteFilePath.lastIndexOf('/')+1)	
							let localFile = localFilePath
							if (localFilePathIsDir) localFile = path.join(localFilePath,file)
							await sftp.get(remoteFilePath,localFile)
						}

						msg.payload = payload
						send([msg,null])
					break;

					case "put":
						remoteFilePath = RED.util.evaluateNodeProperty(node.remoteFilePath,node.remoteFilePathType,node,msg)
						localFilePath = RED.util.evaluateNodeProperty(node.localFilePath,node.localFilePathType,node,msg)

						if (!remoteFilePath) throw new Error('Remote path undefined')
						if (!localFilePath) throw new Error('Local path undefined')
						
						if (Array.isArray(localFilePath)){
							payload=[]
								for(localPath of localFilePath){
								localPath=path.normalize(localPath)
								let file = path.basename(localPath)
								await sftp.put(localPath,path.posix.join(remoteFilePath,file))
								payload.push(localPath)
							}
						} else {																	
							localFilePath=path.normalize(localFilePath)
							let file = path.basename(localFilePath)
							node.status({
								fill: "yellow",
								shape: "ring",
								text: "Put:" + path.posix.join(remoteFilePath,file)
							});
							
							await sftp.put(localFilePath,path.posix.join(remoteFilePath,file))
							payload = localFilePath
						}

						msg.payload = payload
						send([msg,null])
					break;	
					case "delete":
						remoteFilePath = RED.util.evaluateNodeProperty(node.remoteFilePath,node.remoteFilePathType,node,msg)
						if (!remoteFilePath) throw new Error('Remote path undefined')
						
						if (Array.isArray(remoteFilePath)){
							payload=[]
							for(remotePath of remoteFilePath){
								await sftp.delete(remotePath)
								payload.push(remotePath)
							}
						} else {
							await sftp.delete(remoteFilePath)
							payload = remoteFilePath
						}
						msg.payload = payload
						send([msg,null])
					break;	
				}

				node.status({
					fill: "green",
					shape: "dot",
					text: node.method+" done !"
				});	
				
				done()				
			} catch (err) {
				node.status({
					fill: "red",
					shape: "dot",
					text: "Error :"+ err.message
				});
				send([null,{err,inputMsg: msg}])
				done(err)
			} finally {
				try {
					sftp.end()					
				} catch (err) {}
			}
			
		})
	}

	RED.nodes.registerType("SFTP-credentials", SFTPCredentialsNode);
	RED.nodes.registerType("SFTP-main", SFTPNode);
};
