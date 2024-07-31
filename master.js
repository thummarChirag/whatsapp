const port = 3000;
const MAX_INSTANCE_PER_SERVER = 2;
// const mongodbURI = 'mongodb+srv://rejoice:rejoice.dev.@rejoice-dev.o2lyfnw.mongodb.net/master'
const mongodbURI = 'mongodb://localhost:27017/master'
// const mongodbURI = 'mongodb+srv://Yash1234:Yash1234@cluster0.me0ycqm.mongodb.net/master'
// const mongodbURI = 'mongodb+srv://Yash1234:Yash1234@cluster0.me0ycqm.mongodb.net/master'
const VTALKZ_URL = 'http://localhost:9042/api/v1/';
// const VTALKZ_URL = 'https://api.vtalkz.com/api/v1/';

try {
    const http = require('http');
    const express = require('express');
    const app = express();
    const server = http.createServer(app);
    const bodyParser = require('body-parser');
    const axios = require('axios');
    const morgan = require('morgan');
    const mongoose = require('mongoose');
    const { exec } = require('child_process');

    app.use(morgan('dev'));
    app.use(require('cors')({ origin: '*' }));
    app.use(express.json({ limit: '1000mb' }));
    app.use(express.urlencoded({ limit: '1000mb', extended: false }));
    app.use(bodyParser.json());

    const slaveMapSchema = new mongoose.Schema({
        port: {
            type: Number,
            default: 3001,
        },
        instances: {
            type: [String],
            default: [],
        },
    });
    console.log("🚀 ~ slaveMapSchema:", slaveMapSchema)
    const SlaveMap = mongoose.model('SlaveMap', slaveMapSchema);

    function isProcessRunning(processName) {
        return new Promise((resolve, reject) => {
            exec(`pm2 list | grep "${processName}"`, (error, stdout, stderr) => {
                if (error) {
                    resolve(false);
                }

                if (stdout.includes(processName)) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }

    async function startServer(port, isDoNotRestart = false) {
        return new Promise((resolve, reject) => {
            isProcessRunning(`whatsapp-${port}`)
                .then((isRunning) => {
                    if (isDoNotRestart && isRunning) return resolve(true);
                    const command = isRunning
                        ? `pm2 restart "whatsapp-${port}"`
                        : `pm2 start 'PORT=${port} node whatsapp.js' --restart-delay 100 --name "whatsapp-${port}"`;
                    console.log(`🚀 ~ startServer ~ command:`, command);
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.log(`error: ${error.message}`);
                            return resolve(false);
                        }
                        if (stderr) {
                            console.log(`stderr: ${stderr}`);
                            return resolve(false);
                        }
                        return resolve(true);
                    });
                })
                .catch((error) => {
                    console.log(`🚀 ~ startServer ~ error`, error);
                    return resolve(false);
                });
        });
    }

    async function deleteServer(port) {
        return new Promise((resolve, reject) => {
            isProcessRunning(`whatsapp-${port}`)
                .then((isRunning) => {
                    if (isRunning) {
                        const command = `pm2 delete "whatsapp-${port}"`;
                        console.log(`🚀 ~ deleteServer ~ command:`, command);
                        exec(command, (error, stdout, stderr) => {
                            if (error) {
                                console.log(`error: ${error.message}`);
                                return resolve(false);
                            }
                            if (stderr) {
                                console.log(`stderr: ${stderr}`);
                                return resolve(false);
                            }
                            return resolve(true);
                        });
                    } else resolve(false);
                })
                .catch((error) => {
                    console.log(`🚀 ~ deleteServer ~ error`, error);
                    return resolve(false);
                });
        });
    }

    async function startServersIfNotRunning() {
        const slaves = await SlaveMap.find().lean();
        for (const { port } of slaves) {
            console.log(`🚀 ~ START_SERVERS_IF_NOT_RUNNING ~ port`, port);
            await startServer(port, (isDoNotRestart = true));
        }
    }

    async function doSetupNewSlave() {
        let port = (await SlaveMap.findOne().sort({ port: -1 }).limit(1).lean())?.port || 3001;
        port = port + 1;

        const slave = new SlaveMap({ port });
        await slave.save();

        startServer(port);
    }

    const getPort = async (instanceId) => {
        const slave = await SlaveMap.findOne({ instances: { $in: [instanceId] } });
        console.log(`🚀 ~ getPort ~ slave:`, slave);

        if (slave) return slave.port;

        const _out = await SlaveMap.aggregate([
            {
                $addFields: {
                    cnt: { $size: '$instances' },
                },
            },
            {
                $match: { cnt: { $lt: MAX_INSTANCE_PER_SERVER } },
            },
            {
                $sort: { cnt: -1 },
            },
        ]);
        console.log(`🚀 ~ getPort ~ _out:`, _out);

        if (_out.length <= MAX_INSTANCE_PER_SERVER) {
            console.log('🚀🚀🚀🚀🚀🚀🚀🚀 Creating new slave');
            await doSetupNewSlave();
        }
        await SlaveMap.updateOne({ port: _out?.[0]?.port }, { $push: { instances: instanceId } });
        return _out?.[0]?.port || 3001;
    };

    app.get('/get-instances-by-port/:port', async (req, res) => {
        const port = req.params.port;

        const instances = await SlaveMap.find({ port }).distinct('instances');
        res.send({ instances });
    });

    app.post('/reconnect-sessions', async (req, res) => {
        try {
            const slaves = await SlaveMap.find().lean();
	    console.log('OOOO', JSON.stringify(slaves, null, 2));
            for await (const { port } of slaves) {
                try {
		    console.log('delete', port);
                    await deleteServer(port);
                } catch (error) {
                    console.log(`🚀 ~ DELETE SERVER ~ error`, error);
                }
            }

 	    console.log('delete all slaves from storage');
            await SlaveMap.deleteMany({});

	    console.log('start 3001');
            await SlaveMap.create({ port: 3001 });
            await startServer(3001);

	    console.log('wait 5 sec')
	    await new Promise((resolve) => setTimeout(resolve, 5000));

            const handleStartSession = `${VTALKZ_URL}instance/handle-start-session-on-restart`;
            const response = await axios.put(handleStartSession);
            console.log('handleStartSession --> ', response?.data);

            res.send({ success: true });
        } catch (error) {
            console.log('handleStartSession --> error --> ', error?.response?.data);
            res.status(400).send({ error: error?.response?.data || error.message });
        }
    });

    app.patch('/delete-instance/:client', async (req, res) => {
        const instanceId = req.params.client;
        const slaveExists = await SlaveMap.exists({ instances: { $in: [instanceId] } });
        if (!slaveExists) return res.status(400).send({ error: 'instanceId not found' });

        await SlaveMap.updateOne({ instances: { $in: [instanceId] } }, { $pull: { instances: instanceId } });

        const slavesWithNoInstances = await SlaveMap.find({ instances: { $size: 0 } }).lean();
        if (slavesWithNoInstances.length > 1) {
            await deleteServer(slavesWithNoInstances[0].port);
            await SlaveMap.deleteOne({ port: slavesWithNoInstances[0].port });
        }

        res.send({ success: true });
    });

    app.use('*', async (req, res) => {
        console.log("==================================================", )
        const instanceId = req.params.client || req.query.client || req.body.client || req.originalUrl.split('/').pop();
        console.log("🚀 ~ app.use ~ instanceId:", instanceId)
        console.log(`🚀 ~ :`, instanceId, ': ~ 🚀');
        if (!instanceId) return res.status(400).send({ error: 'instanceId is required' });
        const port = await getPort(instanceId);

        const url = `http://localhost:${port}${req.originalUrl}`;
        try {
            console.log("🚀 ~ app.use ~ url:", url)
            const payload = {
                method: req.method?.toLowerCase(),
                maxBodyLength: Infinity,
                url,
                ...(Object.keys(req.body).length > 0 && { data: JSON.stringify(req.body) }),
                ...(Object.keys(req.body).length > 0 && { headers: { 'Content-Type': 'application/json' } }),
            };
            console.log("🚀 ~ app.use ~ payload:", payload)
            const response = await axios(payload);
            res.json(response.data);
        } catch (error) {
            const statusCode = error?.response?.status || 500;
            const data = error?.response?.data || 'Internal Server Error';
            if (!error?.response?.data) console.log(`🚀 ~ app.use ~ error`, error);
            res.status(statusCode).send(data);
        }
    });

    app.use((err, req, res, next) => {
        res.status(500).send({ error: err.message });
    });

    server.listen(port, async () => {
        try {
            await mongoose.connect(mongodbURI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            console.log('MongoDB connected');

            const slaveExists = await SlaveMap.exists({});
            if (!slaveExists) {
                const slave = new SlaveMap({ port: 3001 });
                slave.save();
                await startServer(3001);
                console.log("🚀 ~ server.listen ~ slave:", slave)
            } // else await startServersIfNotRunning();
        } catch (error) {
            console.log('MongoDB connection error: ', error);
        }
        console.log(`Master Server running on port ${port}`);
    });
} catch (error) {
    console.log('GLOBAL Error: ', error);
}