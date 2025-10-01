# TAM-OS (Technical Account Manager Operating System)

A client-side web application for managing customer health assessments and form submissions. Built with vanilla JavaScript, HTML, and CSS with local data storage capabilities.

## 🚀 Features

### Core Functionality
- **Form Submission**: Complete customer health assessment forms
- **Draft Management**: Save and resume incomplete forms
- **Form Review**: View and manage submitted forms and drafts
- **Local Storage**: All data stored locally in the browser
- **Offline-First**: Works without internet connection

### Data Management
- **Draft Auto-Save**: Forms are automatically saved as drafts
- **Form Validation**: Client-side validation before submission
- **Data Persistence**: Uses localStorage and IndexedDB for reliable storage
- **Export/Import**: JSON export/import capabilities
- **Privacy Controls**: Optional encryption for sensitive data

## 📁 Project Structure

```
tam-os/
├── index.html          # Landing page
├── form.html           # Form submission page
├── review.html         # Form review and management page
├── script.js           # Main application logic
├── storage-manager.js  # Data storage and persistence
├── privacy-manager.js  # Optional data encryption
├── styles.css          # Application styling
└── README.md           # This file
```

## 🛠️ Technical Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Storage**: localStorage, sessionStorage, IndexedDB
- **Encryption**: Web Crypto API (optional)
- **Architecture**: Client-side only, no backend required

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server setup required

### Installation
1. Clone or download the repository
2. Open `index.html` in your web browser
3. Start using the application immediately

### First Time Setup
1. Open the application in your browser
2. Navigate to the form page
3. Fill out and submit your first form
4. Use the review page to manage forms and drafts

## 📋 Usage Guide

### Submitting Forms
1. Go to the **Form** page
2. Fill out the customer health assessment
3. Click **"Save Draft"** to save progress
4. Click **"Submit Form"** when complete

### Managing Drafts
1. Go to the **Review** page
2. View all drafts and completed forms
3. Click on a draft to continue editing
4. Use the delete button (🗑️) to remove drafts

### Data Management
- **Drafts**: Automatically saved as you type
- **Submissions**: Finalized forms stored permanently
- **Export**: Download data as JSON for backup
- **Privacy**: Optional encryption for sensitive data

## 🔧 Configuration

### Storage Options
- **localStorage**: Primary storage for drafts and submissions
- **IndexedDB**: Backup storage for larger datasets
- **sessionStorage**: Temporary storage for active sessions

### Privacy Settings
- **Encryption**: Optional password-protected data encryption
- **Data Retention**: Automatic cleanup of old drafts
- **Export Controls**: JSON export with optional encryption

## 📊 Data Models

### Submission
```javascript
{
  id: "submission_1234567890_abc123",
  formVersion: "1.0",
  status: "submitted",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  payload: { /* form data */ }
}
```

### Draft
```javascript
{
  id: "draft_1234567890_abc123",
  formVersion: "1.0", 
  status: "draft",
  updatedAt: "2024-01-01T00:00:00.000Z",
  payload: { /* form data */ }
}
```

## 🔒 Privacy & Security

### Data Storage
- All data stored locally in your browser
- No data sent to external servers
- Optional encryption for sensitive information

### Encryption (Optional)
- Uses Web Crypto API for client-side encryption
- Password-protected data storage
- Can be enabled/disabled in settings

### Data Control
- Complete control over your data
- Export/import capabilities
- Clear data options available

## 🐛 Troubleshooting

### Common Issues
1. **Drafts not saving**: Check browser storage permissions
2. **Forms not loading**: Clear browser cache and reload
3. **Data missing**: Check if localStorage is enabled

### Browser Compatibility
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## 🔄 Data Migration

### Exporting Data
1. Go to Review page
2. Use export functionality to download JSON
3. Store backup file securely

### Importing Data
1. Use import functionality on Review page
2. Select previously exported JSON file
3. Data will be restored to local storage

## 📈 Performance

### Optimization Features
- Debounced auto-save to prevent excessive writes
- Efficient data structures for fast retrieval
- Minimal memory footprint
- Responsive UI design

### Storage Limits
- localStorage: ~5-10MB per domain
- IndexedDB: ~50MB+ per domain
- Automatic cleanup of old data

## 🤝 Contributing

This is a client-side application with no backend dependencies. To contribute:

1. Fork the repository
2. Make your changes
3. Test thoroughly in multiple browsers
4. Submit a pull request

## 📄 License

© 2024 TAM-OS. All rights reserved.

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Ensure all files are properly loaded
4. Verify browser compatibility

---

**Note**: This application stores all data locally in your browser. Make sure to export your data regularly for backup purposes.
