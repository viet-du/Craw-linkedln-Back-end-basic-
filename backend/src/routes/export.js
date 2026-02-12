const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const archiver = require('archiver');
const Candidate = require('../models/Candidate');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { exportLimiter } = require('../middleware/rateLimit');
const { asyncErrorHandler, ValidationError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

// Helper function to format candidate data for export
function formatCandidateForExport(candidate, format) {
  const baseData = {
    'Name': candidate.name || '',
    'Job Title': candidate.job_title || '',
    'Location': candidate.location || '',
    'LinkedIn URL': candidate.linkedin_url || '',
    'Total Experience (years)': candidate.total_experience_count || 0,
    'Score': candidate.score || 0,
    'Data Quality Score': candidate.data_quality_score || 0,
    'Status': candidate.status || 'active',
    'Last Updated': candidate.updated_at ? new Date(candidate.updated_at).toISOString() : '',
    'Crawled At': candidate.crawled_at ? new Date(candidate.crawled_at).toISOString() : ''
  };
  
  // Add skills
  if (candidate.skills && candidate.skills.length > 0) {
    baseData['Skills'] = candidate.skills.join('; ');
  } else {
    baseData['Skills'] = '';
  }
  
  // Add education
  if (candidate.education && candidate.education.length > 0) {
    const educationStr = candidate.education.map(edu => 
      `${edu.school || ''}: ${edu.degree || ''} (${edu.degree_level || 'Other'})${edu.duration ? ` [${edu.duration}]` : ''}`
    ).join(' | ');
    baseData['Education'] = educationStr;
  } else {
    baseData['Education'] = '';
  }
  
  // Add experience
  if (candidate.experience && candidate.experience.length > 0) {
    const experienceStr = candidate.experience.map(exp => 
      `${exp.position || ''} at ${exp.company || ''}${exp.employment_type ? ` (${exp.employment_type})` : ''}${exp.duration ? ` [${exp.duration}]` : ''}`
    ).join(' | ');
    baseData['Experience'] = experienceStr;
  } else {
    baseData['Experience'] = '';
  }
  
  return baseData;
}

// Export to CSV
router.get('/csv', authenticateToken, exportLimiter, asyncErrorHandler(async (req, res) => {
  const { filter, limit = 1000 } = req.query;
  
  let query = {};
  if (filter) {
    try {
      query = JSON.parse(filter);
    } catch (error) {
      throw new ValidationError('Invalid filter format');
    }
  }
  
  const candidates = await Candidate.find(query)
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  if (candidates.length === 0) {
    throw new ValidationError('No candidates found matching the filter');
  }
  
  // Format data for CSV
  const formattedData = candidates.map(candidate => 
    formatCandidateForExport(candidate, 'csv')
  );
  
  // Define CSV fields
  const fields = [
    'Name',
    'Job Title',
    'Location',
    'LinkedIn URL',
    'Total Experience (years)',
    'Score',
    'Data Quality Score',
    'Status',
    'Skills',
    'Education',
    'Experience',
    'Last Updated',
    'Crawled At'
  ];
  
  // Create CSV parser
  const parser = new Parser({ fields });
  const csv = parser.parse(formattedData);
  
  // Set response headers
  const filename = `candidates-export-${Date.now()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  logger.audit('CSV export generated', {
    userId: req.user.id,
    username: req.user.username,
    filter: query,
    count: candidates.length,
    filename,
    ip: req.ip
  });
  
  res.send(csv);
}));

// Export to Excel
router.get('/excel', authenticateToken, exportLimiter, asyncErrorHandler(async (req, res) => {
  const { filter, limit = 1000 } = req.query;
  
  let query = {};
  if (filter) {
    try {
      query = JSON.parse(filter);
    } catch (error) {
      throw new ValidationError('Invalid filter format');
    }
  }
  
  const candidates = await Candidate.find(query)
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  if (candidates.length === 0) {
    throw new ValidationError('No candidates found matching the filter');
  }
  
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LinkedIn Candidates API';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  // Add a worksheet
  const worksheet = workbook.addWorksheet('Candidates');
  
  // Define columns
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Job Title', key: 'job_title', width: 35 },
    { header: 'Location', key: 'location', width: 25 },
    { header: 'LinkedIn URL', key: 'linkedin_url', width: 40 },
    { header: 'Experience (years)', key: 'total_experience_count', width: 15 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Quality Score', key: 'data_quality_score', width: 12 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Top Skills', key: 'skills', width: 40 },
    { header: 'Highest Education', key: 'education', width: 40 },
    { header: 'Recent Experience', key: 'experience', width: 50 },
    { header: 'Last Updated', key: 'updated_at', width: 20 },
    { header: 'Crawled At', key: 'crawled_at', width: 20 }
  ];
  
  // Add data rows
  candidates.forEach(candidate => {
    const rowData = {
      name: candidate.name || '',
      job_title: candidate.job_title || '',
      location: candidate.location || '',
      linkedin_url: candidate.linkedin_url || '',
      total_experience_count: candidate.total_experience_count || 0,
      score: candidate.score || 0,
      data_quality_score: candidate.data_quality_score || 0,
      status: candidate.status || 'active',
      skills: candidate.skills ? candidate.skills.slice(0, 5).join(', ') : '',
      education: candidate.education && candidate.education.length > 0 
        ? `${candidate.education[0].degree_level || 'Unknown'} - ${candidate.education[0].school || 'Unknown'}`
        : '',
      experience: candidate.experience && candidate.experience.length > 0
        ? `${candidate.experience[0].position || ''} at ${candidate.experience[0].company || ''}`
        : '',
      updated_at: candidate.updated_at ? new Date(candidate.updated_at).toLocaleDateString() : '',
      crawled_at: candidate.crawled_at ? new Date(candidate.crawled_at).toLocaleDateString() : ''
    };
    
    worksheet.addRow(rowData);
  });
  
  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { 
      bold: true, 
      color: { argb: 'FFFFFF' } 
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F81BD' }
    };
    cell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center' 
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // Auto-filter
  worksheet.autoFilter = 'A1:M1';
  
  // Freeze header row
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];
  
  // Add a summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 30 }
  ];
  
  const summaryData = [
    { metric: 'Total Candidates Exported', value: candidates.length },
    { metric: 'Average Score', value: (candidates.reduce((sum, c) => sum + (c.score || 0), 0) / candidates.length).toFixed(2) },
    { metric: 'Average Experience (years)', value: (candidates.reduce((sum, c) => sum + (c.total_experience_count || 0), 0) / candidates.length).toFixed(1) },
    { metric: 'Average Quality Score', value: (candidates.reduce((sum, c) => sum + (c.data_quality_score || 0), 0) / candidates.length).toFixed(2) },
    { metric: 'Export Date', value: new Date().toLocaleString() },
    { metric: 'Filter Applied', value: Object.keys(query).length > 0 ? 'Yes' : 'No' }
  ];
  
  summaryData.forEach(data => {
    summarySheet.addRow(data);
  });
  
  // Style summary sheet
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F2F2F2' }
    };
  });
  
  // Set response headers
  const filename = `candidates-export-${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  logger.audit('Excel export generated', {
    userId: req.user.id,
    username: req.user.username,
    filter: query,
    count: candidates.length,
    filename,
    ip: req.ip
  });
  
  // Write workbook to response
  await workbook.xlsx.write(res);
  res.end();
}));

// Export to JSON
router.get('/json', authenticateToken, exportLimiter, asyncErrorHandler(async (req, res) => {
  const { filter, limit = 1000, pretty } = req.query;
  
  let query = {};
  if (filter) {
    try {
      query = JSON.parse(filter);
    } catch (error) {
      throw new ValidationError('Invalid filter format');
    }
  }
  
  const candidates = await Candidate.find(query)
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  if (candidates.length === 0) {
    throw new ValidationError('No candidates found matching the filter');
  }
  
  // Add export metadata
  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      total: candidates.length,
      filter: query,
      format: 'json',
      version: '1.0'
    },
    candidates
  };
  
  // Set response headers
  const filename = `candidates-export-${Date.now()}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  logger.audit('JSON export generated', {
    userId: req.user.id,
    username: req.user.username,
    filter: query,
    count: candidates.length,
    filename,
    ip: req.ip
  });
  
  // Send JSON response
  if (pretty === 'true') {
    res.json(exportData);
  } else {
    res.send(JSON.stringify(exportData));
  }
}));

// Export candidates with photos (if available)
router.get('/with-photos', authenticateToken, requireRole(['admin']), exportLimiter, asyncErrorHandler(async (req, res) => {
  const { limit = 100 } = req.query;
  
  // This is a placeholder for photo export functionality
  // In a real implementation, you would handle photo storage and export
  
  const candidates = await Candidate.find()
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  const exportData = candidates.map(candidate => ({
    ...candidate,
    photoUrl: candidate.photo_url || null,
    hasPhoto: !!(candidate.photo_url)
  }));
  
  const filename = `candidates-with-photos-${Date.now()}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  logger.audit('Export with photos generated', {
    userId: req.user.id,
    username: req.user.username,
    count: candidates.length,
    filename,
    ip: req.ip
  });
  
  res.json({
    metadata: {
      exportedAt: new Date().toISOString(),
      total: candidates.length,
      withPhotos: exportData.filter(c => c.hasPhoto).length
    },
    candidates: exportData
  });
}));

// Bulk export with multiple formats
router.get('/bulk', authenticateToken, requireRole(['admin']), exportLimiter, asyncErrorHandler(async (req, res) => {
  const { format = 'zip', limit = 500 } = req.query;
  
  if (format !== 'zip') {
    throw new ValidationError('Only ZIP format is supported for bulk export');
  }
  
  if (limit > 5000) {
    throw new ValidationError('Bulk export limit cannot exceed 5000');
  }
  
  // Get candidates
  const candidates = await Candidate.find()
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  if (candidates.length === 0) {
    throw new ValidationError('No candidates found');
  }
  
  // Create archive
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });
  
  // Set response headers
  const filename = `candidates-bulk-export-${Date.now()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add JSON file
  const jsonData = JSON.stringify({
    metadata: {
      exportedAt: new Date().toISOString(),
      total: candidates.length,
      format: 'json',
      version: '1.0'
    },
    candidates
  }, null, 2);
  
  archive.append(jsonData, { name: 'candidates.json' });
  
  // Add CSV file
  const formattedData = candidates.map(candidate => 
    formatCandidateForExport(candidate, 'csv')
  );
  
  const fields = [
    'Name',
    'Job Title',
    'Location',
    'LinkedIn URL',
    'Total Experience (years)',
    'Score',
    'Data Quality Score',
    'Status',
    'Skills',
    'Education',
    'Experience',
    'Last Updated',
    'Crawled At'
  ];
  
  const parser = new Parser({ fields });
  const csv = parser.parse(formattedData);
  archive.append(csv, { name: 'candidates.csv' });
  
  // Add README file
  const readmeContent = `
LinkedIn Candidates Export
==========================

Generated: ${new Date().toISOString()}
Total Candidates: ${candidates.length}

Files Included:
1. candidates.json - Complete candidate data in JSON format
2. candidates.csv - Candidate data in CSV format for spreadsheet import

Data Fields:
- Name: Candidate's full name
- Job Title: Current or most recent job title
- Location: Geographic location
- LinkedIn URL: Link to LinkedIn profile
- Total Experience (years): Years of professional experience
- Score: Candidate ranking score (0-100)
- Data Quality Score: Data completeness and quality score (0-100)
- Status: Candidate status (active/inactive/flagged)
- Skills: List of skills (semicolon-separated)
- Education: Educational background
- Experience: Professional experience history
- Last Updated: When the candidate record was last updated
- Crawled At: When the candidate data was initially crawled

For more information, contact the system administrator.
  `;
  
  archive.append(readmeContent, { name: 'README.txt' });
  
  // Finalize archive
  archive.finalize();
  
  logger.audit('Bulk export generated', {
    userId: req.user.id,
    username: req.user.username,
    format: 'zip',
    count: candidates.length,
    filename,
    ip: req.ip
  });
}));

module.exports = router;