const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Setup multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// WhatsApp Cloud API endpoint
const whatsappEndpoint = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Route for sending PDF and text message to WhatsApp
app.post("/send", upload.single("pdf"), async (req, res) => {
  const { number, message } = req.body;
  const pdf = req.file;

  console.log("Incoming request body:", req.body);
  console.log("Incoming file:", req.file);

  if (!number) {
    return res.status(400).send({ error: "Recipient number is required" });
  }

  try {
    let mediaId = null;

    if (pdf) {
      // Create FormData and append the PDF buffer
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", "document");
      form.append("file", pdf.buffer, {
        filename: pdf.originalname,
        contentType: pdf.mimetype,
      });

      try {
        // Upload the PDF to WhatsApp Cloud API
        const mediaResponse = await axios.post(
          `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            },
          }
        );

        console.log("Media Response: ", mediaResponse.data);
        mediaId = mediaResponse.data.id;
      } catch (mediaError) {
        console.error(
          "Error uploading media:",
          mediaError.response ? mediaError.response.data : mediaError.message
        );
        return res.status(500).send({ error: "Failed to upload PDF" });
      }
    }

    // Send the message and/or PDF to the specified WhatsApp number
    const messagePayload = {
      messaging_product: "whatsapp",
      to: number,
    };

    if (message) {
      messagePayload.type = "text";
      messagePayload.text = { body: message };
    }

    if (mediaId) {
      messagePayload.type = "document";
      messagePayload.document = {
        id: mediaId,
        filename: pdf.originalname,
      };
    }

    try {
      const messageResponse = await axios.post(
        whatsappEndpoint,
        messagePayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Message Response: ", messageResponse.data);

      res.status(200).send({ success: "PDF and/or message sent successfully" });

      // Check if message is delivered
      if (messageResponse.data.messages) {
        console.log("Message sent to WhatsApp number:", number);
      } else {
        console.log(
          "Message not delivered. Check WhatsApp account settings or message format."
        );
      }
    } catch (messageError) {
      console.error(
        "Error sending message:",
        messageError.response
          ? messageError.response.data
          : messageError.message
      );
      res.status(500).send({ error: "Failed to send message" });
    }
  } catch (error) {
    console.error("Error in /send route:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
