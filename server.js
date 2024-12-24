const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const connectDb = require('./connectDb');
const Image = require('./model');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // Đảm bảo frontend của bạn là localhost:3000
    methods: ['GET', 'POST'],
  }
});

// Kết nối cơ sở dữ liệu (MongoDB)
connectDb();

// Cấu hình CORS
app.use(cors({
  origin: 'http://localhost:3000', // Đảm bảo frontend của bạn là localhost:3000
  methods: 'GET, POST', 
  allowedHeaders: 'Content-Type',
}));

// Cấu hình Multer (middleware để tải lên ảnh)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Khi có kết nối từ client (Frontend)
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// API để tải lên ảnh
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const result = await cloudinary.uploader.upload_stream(
      { resource_type: 'auto' },
      async (error, result) => {
        if (error) {
          return res.status(500).send('Cloudinary upload failed');
        }

        const image = new Image({
          imageUrl: result.secure_url,
          cloudinaryId: result.public_id,
        });

        await image.save();

        // Gửi thông báo tới tất cả các client qua Socket.IO
        io.emit('newImage', {
          imageUrl: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    result.end(req.file.buffer);
    res.status(200).send("Post and save successfully!");
  } catch (error) {
    res.status(500).send('Error during file upload');
  }
});

// API lấy ảnh mới nhất
app.get('/latest-image', async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      max_results: 1,
      order: 'desc',
    });

    if (!result.resources || result.resources.length === 0) {
      return res.status(404).send('No images found');
    }

    const latestImage = result.resources[0];

    res.status(200).json({
      imageUrl: latestImage.secure_url,
      publicId: latestImage.public_id,
      createdAt: latestImage.created_at,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching latest image');
  }
});

// Khởi động server
server.listen(5000, () => {
  console.log('Server is running on http://localhost:5000');
});