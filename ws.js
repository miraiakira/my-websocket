const crypto = require("crypto");

const { EventEmitter } = require("events");
const http = require("http");

module.exports = class MyWebsocket extends EventEmitter {
	constructor(options) {
		super(options);
		const server = http.createServer();
		server.listen(options.port || 8080);

		server.on("upgrade", (req, socket) => {
			this.socket = socket;
			socket.setKeepAlive(true);

			const resHeaders = [
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				"Sec-WebSocket-Accept: " + hashKey(req.headers["sec-websocket-key"]),
				"",
				"",
			].join("\r\n");

			socket.write(resHeaders);

			socket.on("data", (data) => {
				this.procesData(data);
			});

			socket.on("close", (error) => {
				this.emit("close");
			});
		});
	}

	handleRealData(opcode, realDataBuffer) {
		switch (opcode) {
			case OPCODES.TEXT:
				this.emit("data", realDataBuffer.toString("utf8"));
				break;
			case OPCODES.BINARY:
				this.emit("data", realDataBuffer);
				break;
			default:
				this.emit("close");
				break;
		}
	}

	procesData(bufferData) {
		console.log("processData: ", bufferData);
		const byte1 = bufferData.readUInt8(0);
		let opcode = byte1 & 0x0f;

		const byte2 = bufferData.readUInt8(1);
		const str2 = byte2.toString(2);
		const MASK = str2[0];

		let curByteIndex = 2;

		let payloadLength = parseInt(str2.substring(1), 2);
		if (payloadLength === 126) {
			payloadLength = bufferData.readUInt16BE(2);
			curByteIndex += 2;
		} else if (payloadLength === 127) {
			payloadLength = bufferData.readBigUInt64BE(2);
			curByteIndex += 8;
		}
		let realData = null;

		if (MASK) {
			const maskKey = bufferData.slice(curByteIndex, curByteIndex + 4);
			curByteIndex += 4;
			const payloadData = bufferData.slice(
				curByteIndex,
				curByteIndex + payloadLength
			);
			realData = handleMask(maskKey, payloadData);
		} else {
			realData = bufferData.slice(curByteIndex, curByteIndex + payloadLength);
		}
	}
};

function handleMask(maskBytes, data) {
	const payload = Buffer.alloc(data.length);
	for (let i = 0; i < data.length; i++) {
		payload[i] = maskBytes[i % 4] ^ data[i];
	}

	return payload;
}

function hashKey(key) {
	const sha1 = crypto.createHash("sha1");
	sha1.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
	return sha1.digest("base64");
}

const OPCODES = {
	CONTINUE: 0,
	TEXT: 1, // 文本
	BINARY: 2, // 二进制
	CLOSE: 8,
	PING: 9,
	PONG: 10,
};
