const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const WebSocket = require('ws');

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

app.post('/upload', (req, res) => {
    const file = req.files.file;
    const sessionID = req.body.sessionID;
    if (file && sessionID) {
        const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
        file.mv(filePath, (err) => {
            if (err) return res.status(500).send(err);
            res.send('File uploaded.');
        });
    } else {
        res.status(400).send('File and sessionID are required.');
    }
});

app.post('/apply-signature', async (req, res) => {
    const { sessionID, signatureData } = req.body;
    if (sessionID && signatureData) {
        const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
        if (fs.existsSync(filePath)) {
            const pdfBytes = fs.readFileSync(filePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const signatureImage = await pdfDoc.embedPng(signatureData);
            const pages = pdfDoc.getPages();
            const lastPage = pages[pages.length - 1];
            lastPage.drawImage(signatureImage, {
                x: lastPage.getWidth() / 2 - signatureImage.width / 2,
                y: 10,
                width: signatureImage.width,
                height: signatureImage.height,
            });
            const updatedPdfBytes = await pdfDoc.save();
            fs.writeFileSync(filePath, updatedPdfBytes);
            res.send('Signature applied.');
        } else {
            res.status(404).send('File not found.');
        }
    } else {
        res.status(400).send('SessionID and signatureData are required.');
    }
});

app.get('/download', (req, res) => {
    const { sessionID } = req.query;
    if (sessionID) {
        const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('File not found.');
        }
    } else {
        res.status(400).send('SessionID is required.');
    }
});

const server = app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace('/', ''));
    const sessionID = params.get('sessionId');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (sessionID) {
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    });
});