// Required dependencies
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(null, false);
            return cb(new Error('Only Excel files are allowed!'));
        }
    }
});

// Store questions in memory (in production, use a database)
let questionBank = null;

// Routes
app.post('/api/upload', upload.single('excelFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        questionBank = processExcelData(jsonData);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({ 
            message: 'File processed successfully',
            questionCount: questionBank.length
        });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Error processing file' });
    }
});

app.post('/api/generate', (req, res) => {
    try {
        if (!questionBank) {
            return res.status(400).json({ error: 'No questions available. Please upload an Excel file first.' });
        }

        const { paperType, mainUnit } = req.body;
        let selectedQuestions;

        switch (paperType) {
            case 'mid1':
                selectedQuestions = generateMid1Questions();
                break;
            case 'mid2':
                selectedQuestions = generateMid2Questions();
                break;
            case 'special':
                if (!mainUnit) {
                    return res.status(400).json({ error: 'Main unit not specified for special mid' });
                }
                selectedQuestions = generateSpecialMidQuestions(mainUnit);
                break;
            default:
                return res.status(400).json({ error: 'Invalid paper type' });
        }

        res.json({
            questions: selectedQuestions,
            paperDetails: {
                subject: selectedQuestions[0].subject,
                subjectCode: selectedQuestions[0].subjectCode,
                branch: selectedQuestions[0].branch,
                regulation: selectedQuestions[0].regulation,
                year: selectedQuestions[0].year,
                semester: selectedQuestions[0].semester
            }
        });
    } catch (error) {
        console.error('Error generating questions:', error);
        res.status(500).json({ error: 'Error generating questions: ' + error.message });
    }
});


// Helper functions
function processExcelData(data) {
    return data.map((row, index) => ({
        id: index + 1,
        unit: parseInt(row.Unit),
        question: row.Question,
        btLevel: row['B.T Level'],
        subjectCode: row['Subject Code'],
        subject: row.Subject,
        branch: row.Branch,
        regulation: row.Regulation,
        year: row.Year,
        semester: row.Sem,
        month: row.Month
    }));
}

function generateMid1Questions() {
    const unit1Questions = questionBank.filter(q => q.unit === 1);
    const unit2Questions = questionBank.filter(q => q.unit === 2);
    const unit3Questions = questionBank.filter(q => q.unit === 3);
    
    if (unit1Questions.length < 2 || unit2Questions.length < 2||unit3Questions.length < 1 ) {
        throw new Error('Insufficient questions in Unit 1 ,Unit 2 or Unit 3');
    }

    return [
        ...getRandomQuestions(unit1Questions, 2),
        ...getRandomQuestions(unit2Questions, 2),
        ...getRandomQuestions(unit3Questions, 1),
        ...getRandomQuestions([...unit1Questions, ...unit2Questions], 1)
    ];
}

function generateMid2Questions() {
    const unit3Questions = questionBank.filter(q => q.unit === 3);
    const unit4Questions = questionBank.filter(q => q.unit === 4);
    const unit5Questions = questionBank.filter(q => q.unit === 5);
    
    if (unit3Questions.length < 1 || unit4Questions.length < 2 || unit5Questions.length < 2) {
        throw new Error('Insufficient questions in Units 3, 4, or 5');
    }

    return [
        ...getRandomQuestions(unit3Questions, 1),
        ...getRandomQuestions(unit4Questions, 2),
        ...getRandomQuestions(unit5Questions, 2),
        ...getRandomQuestions([...unit4Questions, ...unit5Questions], 1)
    ];
}

function generateSpecialMidQuestions(mainUnit) {
    const mainUnitQuestions = questionBank.filter(q => q.unit === mainUnit);
    const otherUnitQuestions = questionBank.filter(q => q.unit !== mainUnit);
    
    if (mainUnitQuestions.length < 2) {
        throw new Error(`Insufficient questions in Unit ${mainUnit}`);
    }
    
    if (otherUnitQuestions.length < 4) {
        throw new Error('Insufficient questions in other units');
    }

    const selected = [
        ...getRandomQuestions(mainUnitQuestions, 2), // 2 questions from main unit
        ...getRandomQuestions(otherUnitQuestions, 4) // 4 questions from other units
    ];

    // Randomize the final order of questions
    return selected.sort(() => Math.random() - 0.5);
}

function getRandomQuestions(questions, count) {
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});