const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const uploadsPath = path.join(__dirname, 'uploads');

// Middleware
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));
app.use(cors()); // Enable CORS

// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

// Upload endpoint
app.post('/upload', (req, res) => {
    const { file } = req.files || {};
    const { sessionID } = req.body;

    if (!file || !sessionID) {
        console.error('File or sessionID is missing');
        return res.status(400).send('File and sessionID are required.');
    }

    const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
    file.mv(filePath, (err) => {
        if (err) {
            console.error('Error moving file:', err);
            return res.status(500).send('Failed to upload file.');
        }
        res.send('File uploaded.');
    });
});

// Apply signature endpoint
app.post('/apply-signature', async (req, res) => {
    const { sessionID, signatureData } = req.body;

    if (!sessionID || !signatureData) {
        return res.status(400).send('SessionID and signatureData are required.');
    }

    const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }

    try {
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
    } catch (err) {
        res.status(500).send('Failed to apply signature.');
    }
});

// Download endpoint
app.get('/download', (req, res) => {
    const { sessionID } = req.query;

    if (!sessionID) {
        return res.status(400).send('SessionID is required.');
    }

    const filePath = path.join(uploadsPath, `${sessionID}.pdf`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }

    res.sendFile(filePath);
});

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.slice(1));
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