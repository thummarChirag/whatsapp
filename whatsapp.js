
try {
    const PORT = process.env.PORT || 3001;
    const VTALKZ_URL = 'http://localhost:9042/api/v1/';
    // const VTALKZ_URL = 'https://api.vtalkz.com/api/v1/';
    require('dotenv').config();
    const app = express();
    var cors = require('cors');
    const path = require('path');
    const { exec } = require('child_process');
    const { Client, LocalAuth, MessageMedia, Buttons, List } = require('whatsapp-web.js');
    const express = require('express');
    const multer = require('multer');
    // const puppeteer = require("puppeteer");
    const axios = require('axios');
    const fs = require('fs');
    const fsExtra = require('fs-extra');
    app.use(cors());
    app.use(bodyParser.json());
    let clients = {};
    const multerStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            // Get the type of file.
            const ext = file.mimetype.split('/')[0];
            // In case of not an image store in others
            cb(null, 'uploads/');
        },
        filename: (req, file, cb) => {
            // Combine the Date in milliseconds and original name and pass as filename
            cb(null, `${Date.now()}.${file.originalname}`);
        },
    });
    // Use diskstorage option in multer
    const upload = multer({ storage: multerStorage });
    const bodyParser = require('body-parser');
    // Initialize Express app









    // Require database
    const { MongoStore } = require('wwebjs-mongo');
    const mongoose = require('mongoose');
    const qrcode = require('qrcode-terminal');
    app.post('/start-new-session/:client', async (req, res) => {
        try {
            const { client } = req.params;
            const { isReconnect } = req.body;
            console.log('start-new-session --> ', client, 'client');
            if (!clients[client]) {
                clients[client] = {};
            }
            if (clients[client]?.isConnected && !isReconnect) {
                res.json({ status: 'success', message: 'Already connected' });
                return;
            }
            // gove cooldown time of 2 minutes
            if (clients[client]?.processStartedAt && Date.now() - clients[client]?.processStartedAt < 120000) {
                res.json({ status: 'success', message: 'You can start new session/reconnect after 2 minutes' });
                return;
            }
            const store = new MongoStore({ mongoose: mongoose });
            const newClient = new Client({
                puppeteer: {
                    headless: true, // Try setting this to false if you're encountering issues
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                },
                authStrategy: new LocalAuth({
                    clientId: client,
                })
            });
            let data = {
                newClient,
                client,
                isConnected: false,
                isInProgress: false,
                qrData: null,
                cnt: 0,
                processStartedAt: Date.now(),
            };
            clients[client] = data;

            newClient.on('qr', async (qr) => {
                try {
                    qrcode.generate(qr, { small: true });

                    clients[client].isInProgress = true;
                    clients[client].qrData = qr;
                    clients[client].isConnected = false;
                    clients[client].cnt++;
                    console.log('QR received --> ', client, ' -- ', qr);

                    if (clients[client].cnt >= 5) {
                        const newClient = clients[client].newClient;
                        console.log('🚀 ~ file: whatsapp.js:370 ~ app.put ~ newClient:', newClient);
                        if (newClient) {
                            try {
                                await newClient.destroy();
                            } catch (error) {
                                console.log('ERROR while destroy()', error);
                            }
                            try {
                                await newClient.logout();
                            } catch (error) {
                                console.log('ERROR while logout()', error);
                            }
                        }

                        clients[client].isConnected = false;
                        delete clients[client];
                        console.log('🚀 ~ file: whatsapp.js:397 ~ app.put ~ clients[client]:', clients[client]);
                        try {
                            await fsExtra.remove(path.resolve(__dirname, `./.wwebjs_auth/session-${client}`));
                            console.log('🚀 ~ file: whatsapp.js:400 ~ app.put ~ session removed', client);
                        } catch (error) {
                            console.log('ERROR while removing', error);
                        }

                        const handleLogout = `${VTALKZ_URL}instance/handle-logout/${client}`;
                        console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ handleLogout:', handleLogout);
                        axios
                            .put(handleLogout)
                            .then((res) => {
                                console.log('handleLogout --> ', client, ' -- ', res?.data);
                            })
                            .catch((err) => {
                                console.log('handleLogout --> error --> ', client, ' -- ', err?.response?.data);
                            });

                        const deleteInstance = `http://localhost:3000/delete-instance/${client}`;
                        console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ deleteInstance:', deleteInstance);

                        axios
                            .patch(deleteInstance)
                            .then((res) => {
                                console.log('deleteInstance --> ', client, ' -- ', res?.data);
                            })
                            .catch((err) => {
                                console.log('deleteInstance --> error --> ', client, ' -- ', err?.response?.data);
                            });
                    }
                } catch (error) {
                    console.log('ERROR in qr event', error);
                }
            });

            const HOLAREGEX = /^h+(i+|e+l+o+w*|e+y+|o+l+a+|y+)+$/;
            try {
                newClient.on('message', async (message) => {
                    const isFromGroup = message.from.includes('@g.us');
                    if (isFromGroup) return console.log('SKIP GROUP MESSAGE', message.from, ' -- ', message.body);

                    const handleReceiveMessage = `${VTALKZ_URL}instance/handle-receive-message/${client}`;
                    const body = { message: message };
                    console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ handleReceiveMessage:', handleReceiveMessage);
                    axios
                        .post(handleReceiveMessage, body)
                        .then((res) => {
                            console.log('handleReceiveMessage --> ', client, ' -- ', res?.data);
                        })
                        .catch((err) => {
                            console.log('handleReceiveMessage --> error --> ', client, ' -- ', err?.response?.data);
                        })


                    // console.log(`🚀 ~ app.post ~ message.from:`, message);
                    // console.log(
                    //     `🚀 ~ app.post ~ HOLAREGEX.test(message.body.toLowerCase()):`,
                    //     message.body,
                    //     HOLAREGEX.test(message.body.toLowerCase())
                    // );

                    // if (HOLAREGEX.test(message.body.toLowerCase())) {
                    //     await newClient.sendMessage(
                    //         message.from,
                    //         'Hola, ' + message._data.notifyName || User
                    //     );
                    //     // const link =
                    //     //     'https://statusneo.com/wp-content/uploads/2023/02/MicrosoftTeams-image551ad57e01403f080a9df51975ac40b6efba82553c323a742b42b1c71c1e45f1.jpg';
                    //     // const caption = `HEADER\n\nBODY\n\nFOOTER`;
                    //     // const media = await MessageMedia.fromUrl(link, {
                    //     //     filename: link.split('/').pop(),
                    //     //     unsafeMime: true,
                    //     // });
                    //     // if (caption) await newClient.sendMessage(message.from, media, { caption });
                    //     // else await newClient.sendMessage(message.from, media);
                    // }
                });
            } catch (error) {
                console.log('ERROR ON MESSAGE', error);
            }

            newClient.on('ready', async () => {
                clients[client].isInProgress = false;
                clients[client].qrData = null;
                clients[client].isConnected = true;
                clients[client].info = newClient.info;
                const handleConnect = `${VTALKZ_URL}instance/handle-connect/${client}`;
                console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ handleConnect:', handleConnect);
                const body = { info: newClient.info };
                axios
                    .put(handleConnect, body)
                    .then((res) => {
                        console.log('handleConnect --> ', client, ' -- ', res?.data);
                    })
                    .catch((err) => {
                        console.log('handleConnect --> error --> ', client, ' -- ', err?.response?.data);
                    });
                console.log('Client is ready! --> ', client, ' -- ', newClient.info);
            });

            newClient.on('remote_session_saved', () => {
                // Do Stuff...
                console.log('remote_session_saved --> ', client);
            });

            try {
                newClient.on('disconnected', async (reason) => {
                    console.log('newClient was logged out --> ', client, ' -- ', reason);
                    try {
                        await fsExtra.remove(path.resolve(__dirname, `./.wwebjs_auth/session-${client}`));
                    } catch (error) {
                        console.log('ERROR while removing', error);
                    }
                    // clients[client].isConnected = false;
                    // clients[client].isInProgress = false;
                    // clients[client].qrData = null;
                    // clients[client].info = null;
                    delete clients[client];
                    const handleLogout = `${VTALKZ_URL}instance/handle-logout/${client}`;
                    console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ handleLogout:', handleLogout);
                    await axios
                        .put(handleLogout)
                        .then((res) => {
                            console.log('handleLogout --> ', client, ' -- ', res?.data);
                        })
                        .catch((err) => {
                            console.log('handleLogout --> error --> ', client, ' -- ', err?.response?.data);
                        });

                    const deleteInstance = `http://localhost:3000/delete-instance/${client}`;
                    console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ deleteInstance:', deleteInstance);

                    await axios
                        .patch(deleteInstance)
                        .then((res) => {
                            console.log('deleteInstance --> ', client, ' -- ', res?.data);
                        })
                        .catch((err) => {
                            console.log('deleteInstance --> error --> ', client, ' -- ', err?.response?.data);
                        });
                    // try {
                    //   await mongoose.connection.db.dropCollection(
                    //     `whatsapp-RemoteAuth-${client}.files`
                    //   );
                    // } catch (error) {}
                    // try {
                    //   await mongoose.connection.db.dropCollection(
                    //     `whatsapp-RemoteAuth-${client}.chunks`
                    //   );
                    // } catch (error) {}
                    // const command = `pm2 delete "whatsapp-${PORT}"`;
                    //     console.log(`🚀 ~ deleteServer ~ command:`, command);
                    //     exec(command, (error, stdout, stderr) => {
                    //         if (error) {
                    //             console.log(`error: ${error.message}`);
                    //             return resolve(false);
                    //         }
                    //         if (stderr) {
                    //             console.log(`stderr: ${stderr}`);
                    //             return resolve(false);
                    //         }
                    //         return resolve(true);
                    //     });

                    // clients[client].isConnected = false;
                });
            } catch (error) {
                try {
                    await fsExtra.remove(path.resolve(__dirname, `./.wwebjs_auth/session-${client}`));
                } catch (_error) {
                    console.log('__ERROR while removing', _error);
                }
                axios
                    .put(handleLogout)
                    .then((res) => {
                        console.log('__handleLogout --> ', client, ' -- ', res?.data);
                    })
                    .catch((err) => {
                        console.log('__handleLogout --> error --> ', client, ' -- ', err?.response?.data);
                    });
                const deleteInstance = `http://localhost:3000/delete-instance/${client}`;
                console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ deleteInstance:', deleteInstance);

                axios
                    .patch(deleteInstance)
                    .then((res) => {
                        console.log('deleteInstance --> ', client, ' -- ', res?.data);
                    })
                    .catch((err) => {
                        console.log('deleteInstance --> error --> ', client, ' -- ', err?.response?.data);
                    });
            }

            newClient.on('change_state', (state) => {
                console.log('CHANGE STATE --> ', client, ' -- ', state);
            });

            // clients.push(data);
            newClient
                .initialize()
                .then((initializeData) => {
                    console.log('initialize() then()', initializeData);
                })
                .catch((initializeError) => {
                    console.log('initialize() catch()', initializeError);
                });
            res.json({ status: 'success', message: 'Session started' });
        } catch (err) {
            console.log(err);
        }
    });
    app.post('/send-message/:client', async (req, res) => {
        try {
            const { client } = req.params;
            const { phone, message, link, html, caption, buttons } = req.body;
            console.log('ENTERED IN SEND MESSAGE', { body: req.body });
            if (!clients[client]) {
                clients[client] = {
                    isInProgress: false,
                    isConnected: false,
                    qrData: null,
                    info: null,
                };
            }
            if (!clients[client].isConnected) {
                res.status(400).json({ status: 'error', message: 'Client is not connected' });
                return;
            }
            const newClient = clients[client].newClient;
            let msg = false;
            let responseFromSendMessage = null;
            if (buttons) {
                let messagebody = message || '';
                if (link) {
                    messagebody = await MessageMedia.fromUrl(link, {
                        filename: link.split('/').pop().substr(7),
                        unsafeMime: true,
                    });
                }

                // const productsList = new List(
                //     "Here's our list of products at 50% off",
                //     'View all products',
                //     [
                //         {
                //             title: 'Products list',
                //             rows: [
                //                 { id: 'apple12313', title: 'Apple' },
                //                 { id: 'mango12312312', title: 'Mango' },
                //                 { id: 'banana234234', title: 'Banana' },
                //             ],
                //         },
                //     ],
                //     'Please select a product'
                // );
                // responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', productsList);

                // const buttonsTemplate = new Buttons(
                //     'Here are some buttons',
                //     buttons,
                //     'This is a Title',
                //     'This is a Footer'
                // )
                // console.log(`🚀 ~ app.post ~ buttonsTemplate:`, JSON.stringify(buttonsTemplate, null, 2));

                // responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', buttonsTemplate)
                // console.log(`🚀 ~ app.post ~ responseFromSendMessage:`, responseFromSendMessage);

            } else if (link) {
                const media = await MessageMedia.fromUrl(link, {
                    filename: decodeURIComponent(link).split('/').pop(),
                    unsafeMime: true,
                });
                if (!caption) responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media);
                else responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media, { caption });
                msg = true;
            } else if (req.file?.path) {
                // join the path of the directory with the filename
                // let path = require('path');
                // let url = path.join(__dirname, req.file?.path);
                // console.log(url);
                const media = MessageMedia.fromFilePath(req.file?.path);
                if (!caption) responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media);
                else responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media, { caption });
                msg = true;
            } else if (html) {
                var html_to_pdf = require('html-pdf-node');
                const { PDFDocument, degrees, rgb } = require('pdf-lib');
                let file = { content: html };
                let pdfBuffer = await new Promise(async (resolve, reject) => {
                    await html_to_pdf
                        .generatePdf(file, {})
                        .then(async (pdfBuffer) => {
                            console.log('first');
                            resolve(pdfBuffer);
                        })
                        .catch((err) => {
                            console.log('second');
                            reject(err);
                        });
                });

                const document = await PDFDocument.load(pdfBuffer);
                await document.save();
                let fileName = Date.now() + 'blank.pdf';
                fs.writeFileSync(fileName, await document.save());
                const media = MessageMedia.fromFilePath(fileName);
                if (!caption) responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media);
                else responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', media, { caption });
                msg = true;
                fs.unlinkSync(fileName);
            }
            if (!msg) responseFromSendMessage = await newClient.sendMessage(phone + '@c.us', message);

            console.log('RESPONSE FROM SEND MESSAGE', responseFromSendMessage);
            res.json({ status: 'success', message: 'Message sent' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Oops! Something went wrong. Please try again later.' });
            console.log(err);
        }
    });
    app.get('/get-qrcode/:client', async (req, res) => {
        try {
            const { client } = req.params;
            console.log('QR requested --> ', client);
            if (!clients[client]) {
                clients[client] = {
                    isInProgress: false,
                    isConnected: false,
                    qrData: null,
                    info: null,
                };
            }

            res.json({
                status: 'success',
                message: 'QR Code generated',
                data: {
                    qrData: clients[client].qrData,
                    isInProgress: clients[client].isInProgress,
                    isConnected: clients[client].isConnected,
                    info: clients[client].info,
                },
            });
        } catch (err) {
            console.log(err);
        }
    });
    app.put('/logout/:client', async (req, res) => {
        try {
            const { client } = req.params;
            console.log(client, 'client');
            if (!clients[client]) {
                clients[client] = {
                    isInProgress: false,
                    isConnected: false,
                    qrData: null,
                };
                console.log('�� ~ file: whatsapp.js:346 ~ app.put ~ clients[client]:', clients[client]);
            }
            // if (!clients[client].isConnected) {
            //   res
            //     .status(500)
            //     .json({ status: "error", message: "Client is not connected" });
            //   return;
            // }
            // try {
            //   await mongoose.connection.db.dropCollection(
            //     `whatsapp-RemoteAuth-${client}.files`
            //   );
            // } catch (error) {}
            // try {
            //   await mongoose.connection.db.dropCollection(
            //     `whatsapp-RemoteAuth-${client}.chunks`
            //   );
            // } catch (error) {}

            if (clients[client].isConnected) {
                const newClient = clients[client].newClient;
                console.log('🚀 ~ file: whatsapp.js:370 ~ app.put ~ newClient:', newClient);
                if (newClient) {
                    try {
                        await newClient.logout();
                    } catch (error) {
                        console.log('ERROR while removing', error);
                    }
                    try {
                        await newClient.destroy();
                    } catch (error) {
                        console.log('ERROR while removing', error);
                    }
                }
            }
            const deleteInstance = `http://localhost:3000/delete-instance/${client}`;
            console.log('🚀 ~ file: whatsapp.js:185 ~ newClient.on ~ deleteInstance:', deleteInstance);

            axios
                .patch(deleteInstance)
                .then((res) => {
                    console.log('deleteInstance --> ', client, ' -- ', res?.data);
                })
                .catch((err) => {
                    console.log('deleteInstance --> error --> ', client, ' -- ', err?.response?.data);
                });

            // clients[client].isConnected = false;
            delete clients[client];
            console.log('🚀 ~ file: whatsapp.js:397 ~ app.put ~ clients[client]:', clients[client]);
            try {
                await fsExtra.remove(path.resolve(__dirname, `./.wwebjs_auth/session-${client}`));
                console.log('🚀 ~ file: whatsapp.js:400 ~ app.put ~ session removed', client);
            } catch (error) {
                console.log('ERROR while removing', error);
            }
            res.json({
                status: 'success',
                message: 'Logout successfully',
            });
        } catch (err) {
            console.log('Error::', err);
            return res.status(200).json({ status: 'error', message: err.message });
        }
    });

    app.listen(PORT, async () => {
        console.log('Server is running on port ' + PORT);
        try {
            await handleSReconnectSessionOnRestart();
        } catch (error) {
            console.log('ERROR while handleSReconnectSessionOnRestart:: ', error);
        }
    });
} catch (error) {
    console.log('GLOBAL ERROR', error);
}