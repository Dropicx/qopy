# Qopy - Secure Text Sharing

A modern, secure, and privacy-focused web application for temporary text sharing. Share text snippets, code, or any content with automatic expiration and optional password protection.

## 🚀 Features

### Core Functionality
- **6-character unique ID generation** for each shared clip
- **Configurable expiration times**: 5min, 15min, 30min, 1hr, 6hr, 24hr
- **Instant sharing** with immediate link generation
- **QR code generation** for easy mobile sharing
- **Copy-to-clipboard functionality** for all shared content
- **Mobile-first responsive design**

### Security & Privacy
- **No permanent storage** - everything expires automatically
- **Optional password protection** for sensitive content
- **One-time access option** (self-destruct after first read)
- **Rate limiting** to prevent abuse
- **Input sanitization** and XSS protection
- **No content logging** beyond expiration time
- **Secure headers** with Helmet.js

### User Experience
- **Dark/light theme toggle** with persistent preferences
- **Clean, minimalist interface** 
- **Character counter** with visual feedback
- **Toast notifications** for user feedback
- **Keyboard shortcuts** for power users
- **Auto-cleanup** of expired clips
- **URL routing** for direct clip access

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Database**: In-memory storage (Map)
- **Security**: Helmet, CORS, Rate limiting, Input validation
- **Additional**: QR code generation, Compression, UUID

## 📦 Installation

### Prerequisites
- Node.js 14.0.0 or higher
- npm or yarn package manager

### Quick Start

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd qopy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 🚀 Deploy to Production

### Railway (Recommended)
The easiest way to deploy Qopy is using Railway.app:

1. **One-Click Deploy:**
   [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

2. **Manual Deploy:**
   See [README.Railway.md](./README.Railway.md) for detailed Railway deployment instructions.

### Docker
Alternatively, deploy using Docker:
```bash
docker-compose up -d --build
```

## 🖥 Usage

### Sharing Content

1. **Navigate to the Share tab**
2. **Enter your content** in the large text area (up to 100,000 characters)
3. **Select expiration time** from the dropdown
4. **Optional settings**:
   - Check "Self-destruct after first read" for one-time access
   - Enter a password for additional security
5. **Click "Create Share Link"**
6. **Share the generated URL or QR code**

### Retrieving Content

1. **Navigate to the Retrieve tab**
2. **Enter the 6-character clip ID**
3. **Enter password if required**
4. **Click "Retrieve Content"**
5. **Copy the retrieved content** using the copy button

### Direct Access

Share URLs have the format: `https://qopy.io/clip/X8K2M9`

Recipients can click the link to go directly to the retrieve interface with the ID pre-filled.

## 🔧 API Endpoints

### Create Clip
```http
POST /api/clip
Content-Type: application/json

{
  "content": "Your content here",
  "expiration": "30min",
  "oneTime": false,
  "password": "optional-password"
}
```

**Response:**
```json
{
  "success": true,
  "clipId": "X8K2M9",
  "shareUrl": "https://qopy.io/clip/X8K2M9",
  "qrCode": "data:image/png;base64,...",
  "expiresAt": 1640995200000,
  "expiresIn": 1800000
}
```

### Retrieve Clip
```http
GET /api/clip/:id
```

For password-protected clips:
```http
POST /api/clip/:id
Content-Type: application/json

{
  "password": "clip-password"
}
```

**Response:**
```json
{
  "success": true,
  "content": "Your retrieved content",
  "createdAt": 1640993400000,
  "expiresAt": 1640995200000,
  "oneTime": false
}
```

### Get Clip Metadata
```http
GET /api/clip/:id/info
```

**Response:**
```json
{
  "success": true,
  "hasPassword": true,
  "oneTime": false,
  "expiresAt": 1640995200000,
  "createdAt": 1640993400000
}
```

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "uptime": 3600.123,
  "activeClips": 42,
  "timestamp": "2023-12-31T23:59:59.000Z"
}
```

## ⌨️ Keyboard Shortcuts

- `Ctrl/Cmd + T` - Toggle theme
- `Ctrl/Cmd + 1` - Switch to Share tab
- `Ctrl/Cmd + 2` - Switch to Retrieve tab
- `Escape` - Close modal
- `Enter` - Submit forms when in input fields

## 🎨 Theming

The application supports both light and dark themes with smooth transitions. Theme preference is stored in localStorage and persists across sessions.

## 🔒 Security Features

- **Rate Limiting**: 20 requests per 15 minutes for creation, 100 for retrieval
- **Input Validation**: Server-side validation using express-validator
- **XSS Protection**: Content Security Policy and input sanitization
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers for production deployment
- **Memory Cleanup**: Automatic removal of expired clips

## 📱 Mobile Support

- Touch-friendly interface with large buttons
- Responsive design that works on all screen sizes
- QR code generation for easy mobile sharing
- iOS-specific optimizations (font sizes to prevent zoom)

## 🚀 Production Deployment

### Environment Variables

```bash
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode
```

### Recommended Production Setup

1. **Use a process manager like PM2**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "qopy"
   ```

2. **Set up reverse proxy with nginx**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable HTTPS with Let's Encrypt**
   ```bash
   certbot --nginx -d yourdomain.com
   ```

## 🔧 Configuration

### Rate Limiting
Modify rate limits in `server.js`:
```javascript
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // requests per window
});
```

### Content Limits
Adjust content size limits:
```javascript
app.use(express.json({ limit: '1mb' }));
```

### Cleanup Interval
Change cleanup frequency:
```javascript
setInterval(cleanupExpiredClips, 60000); // Every minute
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This application is designed for temporary, anonymous text sharing. Do not share sensitive personal information, passwords, or confidential data. Content is stored in server memory and will be lost on server restart.

## 🆘 Support

For issues, questions, or feature requests, please create an issue in the repository or contact the maintainers.

---

**Built with ❤️ for secure, anonymous text sharing** 