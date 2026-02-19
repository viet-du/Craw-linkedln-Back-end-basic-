const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
require('dotenv').config();
const Candidate = require('../models/Candidate');
const DataQualityChecker = require('../utils/dataQuality');
const { logger } = require('../utils/logger');

// Command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}
function normalizeEmploymentType(value) {
  if (!value) return 'Other';

  const types = [
    'Full-time',
    'Part-time',
    'Contract',
    'Internship',
    'Freelance'
  ];

  for (const t of types) {
    if (value.includes(t)) return t;
  }

  return 'Other';
}

// Normalize URL function
function normalizeUrl(raw) {
  if (!raw) return '';
  try {
    let urlStr = raw.toString().trim();
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = 'https://' + urlStr;
    }
    const u = new URL(urlStr);
    let pathname = u.pathname.replace(/\/+$/, '');
    const normalized = `${u.protocol}//${u.hostname.toLowerCase()}${pathname}`;
    return normalized;
  } catch (e) {
    return raw;
  }
}

// Calculate score function
function calculateScore(profile) {
  let score = 0;
  
  // Experience points (0-40)
  const expScore = Math.min((profile.total_experience_count || 0) * 4, 40);
  score += expScore;
  
  // Education points (0-30)
  const education = profile.education || [];
  let eduScore = 0;
  education.forEach(edu => {
    const level = classifyDegree(edu.degree);
    switch(level) {
      case 'PhD': eduScore += 30; break;
      case 'Master': eduScore += 25; break;
      case 'MBA': eduScore += 20; break;
      case 'Bachelor': eduScore += 15; break;
      case 'High School': eduScore += 5; break;
      default: eduScore += 10;
    }
  });
  score += Math.min(eduScore, 30);
  
  // Experience entries points (0-20)
  const expCount = profile.experience?.length || 0;
  score += Math.min(expCount * 2, 20);
  
  // Skills points (0-10)
  const skills = extractSkills(profile);
  score += Math.min(skills.length * 0.5, 10);
  
  return Math.round(score);
}

// Extract skills function
function extractSkills(profile) {
  const skills = new Set();
  const text = [
    profile.job_title || '',
    ...(profile.experience || []).map(e => e.position || ''),
    ...(profile.education || []).map(e => e.degree || '')
  ].join(' ').toLowerCase();
  
  const techKeywords = [
    'python', 'javascript', 'java', 'c++', 'react', 'node.js', 'nodejs',
    'aws', 'azure', 'docker', 'kubernetes', 'machine learning', 'ml',
    'ai', 'data science', 'sql', 'nosql', 'devops', 'frontend', 'backend',
    'typescript', 'go', 'rust', 'swift', 'kotlin', 'flutter',
    'react native', 'vue.js', 'angular', 'spring', 'django', 'flask'
  ];
  
  techKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const formatted = keyword.split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('.');
      skills.add(formatted);
    }
  });
  
  return Array.from(skills);
}

// Classify degree function
function classifyDegree(degree) {
  if (!degree) return 'Other';
  
  const degreeLower = degree.toLowerCase();
  
  if (degreeLower.includes('phd') || degreeLower.includes('doctor')) return 'PhD';
  if (degreeLower.includes('master')) return 'Master';
  if (degreeLower.includes('mba')) return 'MBA';
  if (degreeLower.includes('bachelor') || degreeLower.includes('b.s.') || degreeLower.includes('b.a.')) return 'Bachelor';
  if (degreeLower.includes('high school')) return 'High School';
  
  return 'Other';
}

// Import data function
async function importData() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_TEST_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
    const db = mongoose.connection.db;
    // Ask for file path
    let dataPath = await askQuestion('📂 Enter the path to the JSON file (or press Enter for default): ');
    
    if (!dataPath.trim()) {
      // Try default paths
      const defaultPaths = [
        path.join(__dirname, '../../../data/output.json'),
        path.join(__dirname, '../../../Data/output.json'),
        path.join(__dirname, '../../data/output.json'),
        './data/output.json'
      ];
      
      for (const defaultPath of defaultPaths) {
        try {
          await fs.access(defaultPath);
          dataPath = defaultPath;
          console.log(`📂 Using default file: ${dataPath}`);
          break;
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!dataPath) {
      console.error('❌ No JSON file found. Please specify a path.');
      rl.close();
      process.exit(1);
    }
    
    // Check if file exists
    try {
      await fs.access(dataPath);
    } catch (err) {
      console.error(`❌ File not found: ${dataPath}`);
      rl.close();
      process.exit(1);
    }
    
    console.log(`📂 Reading file: ${dataPath}`);
    
    // Read and parse JSON file
    const data = await fs.readFile(dataPath, 'utf8');
    let profiles;
    
    try {
      profiles = JSON.parse(data);
    } catch (err) {
      console.error('❌ Error parsing JSON file:', err.message);
      rl.close();
      process.exit(1);
    }
    
    if (!Array.isArray(profiles)) {
      console.error('❌ JSON file must contain an array of profiles');
      rl.close();
      process.exit(1);
    }
    
    console.log(`📊 Found ${profiles.length} profiles to import`);
    
    // Ask for import options
    console.log('\n⚙️  Import Options:');
    console.log('1. Upsert (update existing, insert new)');
    console.log('2. Insert only (skip existing)');
    console.log('3. Replace all (clear database first)');
    
    const option = await askQuestion('Choose option (1-3, default: 1): ');
    
    // Clear database if option 3
    if (option === '3') {
      const confirm = await askQuestion('⚠️  WARNING: This will delete ALL existing candidates. Type "YES" to confirm: ');
      if (confirm !== 'YES') {
        console.log('❌ Import cancelled');
        rl.close();
        process.exit(0);
      }
      
      console.log('🗑️  Clearing database...');
      await Candidate.deleteMany({});
      console.log('✅ Database cleared');
    }
    
    // Ask for validation
    const validate = await askQuestion('Validate data before import? (y/n, default: y): ');
    const shouldValidate = validate.toLowerCase() !== 'n';
    
    // Ask for batch size
    const batchSizeInput = await askQuestion('Batch size (default: 50): ');
    const batchSize = batchSizeInput ? parseInt(batchSizeInput) : 50;
    
    console.log('\n🚀 Starting import...\n');
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = [];
    let validationErrors = [];
    
    // Process profiles in batches
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(profiles.length/batchSize)} (${i+1}-${Math.min(i+batchSize, profiles.length)})`);
      
      for (const [index, profile] of batch.entries()) {
        const globalIndex = i + index + 1;
        
        try {
          // Normalize URL
          const rawUrl = profile.url || profile.linkedin_url || '';
          const normalized = normalizeUrl(rawUrl);
          
          // Validate data if requested
          if (shouldValidate) {
            const validation = DataQualityChecker.validateProfile(profile);
            if (!validation.isValid) {
              validationErrors.push({
                profile: profile.name || `Profile ${globalIndex}`,
                errors: validation.errors
              });
              skipped++;
              console.log(`⏩ [${globalIndex}/${profiles.length}] Skipped ${profile.name || 'Unknown'} - Validation failed`);
              continue;
            }
          }
          
          // Calculate score
          const score = calculateScore(profile);
          
          // Extract skills
          const skills = extractSkills(profile);
          
          // Classify education
          const educationWithLevel = (profile.education || []).map(edu => {
            const cleanedDegree = (edu.degree || '').trim().slice(0, 200);

            return {
              ...edu,
              degree: cleanedDegree,
              degree_level: classifyDegree(cleanedDegree)
            };
          });
          
          // Prepare candidate data
         const candidateData = {
          name: profile.name,
          location: profile.location,
          job_title: profile.job_title,
          total_experience_count: profile.total_experience_count || 0,
          linkedin_url: rawUrl,
          normalized_url: normalized,
          education: educationWithLevel,
          experience: (profile.experience || []).map(exp => ({
            ...exp,
            employment_type: normalizeEmploymentType(exp.employment_type)
          })),
          score: score,
          skills: skills,
          crawled_at: profile.crawled_at ? new Date(profile.crawled_at) : new Date(),
          data_quality_score: shouldValidate ? DataQualityChecker.calculateQualityScore(profile, 0) : 0
  };
;
          
          // Find existing candidate
          const filter = normalized ? { normalized_url: normalized } : { linkedin_url: rawUrl };
          const existingCandidate = await Candidate.findOne(filter);
          
          if (existingCandidate) {
            if (option === '2') {
              // Skip existing
              skipped++;
              console.log(`⏩ [${globalIndex}/${profiles.length}] Skipped existing: ${profile.name}`);
            } else {
              // Update existing
              Object.assign(existingCandidate, candidateData);
              await existingCandidate.save();
              updated++;
              console.log(`🔄 [${globalIndex}/${profiles.length}] Updated: ${profile.name}`);
            }
          } else {
            // Create new
            const candidate = new Candidate(candidateData);
            await candidate.save();
            imported++;
            console.log(`✅ [${globalIndex}/${profiles.length}] Imported: ${profile.name}`);
          }
          
          // Small delay to prevent overwhelming the database
          if (globalIndex % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          errors.push({
            profile: profile.name || `Profile ${globalIndex}`,
            error: error.message
          });
          console.error(`❌ [${globalIndex}/${profiles.length}] Error importing ${profile.name || 'Unknown'}:`, error.message);
        }
      }
      
      console.log(`   Batch completed: ${imported} imported, ${updated} updated, ${skipped} skipped\n`);
    }
    
    // Display summary
    console.log('\n🎉 Import Summary:');
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⏩ Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors.length}`);
    
    if (validationErrors.length > 0) {
      console.log(`   ⚠️  Validation errors: ${validationErrors.length}`);
    }
    
    if (errors.length > 0) {
      console.log('\n📋 Error details (first 10):');
      errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.profile}: ${err.error}`);
      });
      
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }
    
    if (validationErrors.length > 0) {
      console.log('\n📋 Validation error details (first 5):');
      validationErrors.slice(0, 5).forEach(err => {
        console.log(`   - ${err.profile}:`);
        err.errors.slice(0, 3).forEach(error => {
          console.log(`     * ${error}`);
        });
        if (err.errors.length > 3) {
          console.log(`     ... and ${err.errors.length - 3} more errors`);
        }
      });
    }
    
    // Get final statistics
    const total = await Candidate.countDocuments();
    console.log(`\n📊 Total candidates in database: ${total}`);
    
    // Get top candidates
    const topCandidates = await Candidate.find()
      .sort({ score: -1 })
      .limit(5)
      .select('name job_title score total_experience_count data_quality_score');
    
    console.log('\n🏆 Top 5 Candidates by Score:');
    topCandidates.forEach((candidate, i) => {
      console.log(`   ${i + 1}. ${candidate.name} - ${candidate.job_title}`);
      console.log(`      Score: ${candidate.score}, Exp: ${candidate.total_experience_count} yrs, Quality: ${candidate.data_quality_score}`);
    });
    
    // Get quality statistics
    const qualityStats = await Candidate.aggregate([
      {
        $bucket: {
          groupBy: '$data_quality_score',
          boundaries: [0, 50, 70, 85, 95, 101],
          default: 'Unknown',
          output: {
            count: { $sum: 1 },
            avgScore: { $avg: '$score' }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('\n📈 Data Quality Distribution:');
    qualityStats.forEach(stat => {
      const range = stat._id === 0 ? '0-49' :
                   stat._id === 50 ? '50-69' :
                   stat._id === 70 ? '70-84' :
                   stat._id === 85 ? '85-94' :
                   stat._id === 95 ? '95-100' : 'Unknown';
      console.log(`   ${range}: ${stat.count} candidates (avg score: ${stat.avgScore?.toFixed(1) || 'N/A'})`);
    });
    // ===== GHI LOG VÀO MONGODB =====
try {
  const importLog = {
    source: "linkedin_crawler",
    import_timestamp: new Date(),
    file_path: dataPath,
    total_processed: profiles.length,
    imported,
    updated,
    skipped,
    errors: errors.length,
    validation_errors: validationErrors.length,
    status: errors.length === 0 ? "success" : "partial_failure"
  };
//Ghi log vào collection import_logs
await db.collection('import_logs').insertOne(importLog);
  console.log('📝 Đã ghi log import vào collection import_logs');
} catch (logErr) {
  console.error('⚠️ Không thể ghi log import:', logErr.message);
}
    // Log import completion
    logger.info('Data import completed', {
      imported,
      updated,
      skipped,
      errors: errors.length,
      validationErrors: validationErrors.length,
      total,
      file: dataPath
    });
    
    console.log('\n✅ Import completed successfully!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    logger.error('Import failed', { error: error.message });
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run import
if (require.main === module) {
  importData().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

module.exports = { importData };