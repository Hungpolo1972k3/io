const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const connectDb = require('./connectDb');
const Image = require('./model');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const User = require('./usermodel')
dotenv.config();

const app = express();
app.use(express.json())
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

app.post('/register', async (req, res) => {
  try {
    const { email, password, fullname } = req.body;

    // Kiểm tra các trường cần thiết
    if (!email || !password || !fullname) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Regular expression cho email
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo người dùng mới
    const newUser = new User({
      email,
      password: hashedPassword,
      fullname,
    });

    // Lưu người dùng vào cơ sở dữ liệu
    await newUser.save();

    res.status(201).json({ 
      message: 'User registered successfully',
      email: newUser.email,
      fullname: newUser.fullname
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra các trường cần thiết
    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Kiểm tra xem người dùng có tồn tại không
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Invalid email or password' });
    }

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        fullname: user.fullname,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Khởi động server
server.listen(5000, () => {
  console.log('Server is running on http://localhost:5000');
});