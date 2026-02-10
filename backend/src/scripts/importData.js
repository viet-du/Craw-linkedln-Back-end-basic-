const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const Candidate = require('../models/Candidate');

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function importData() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connection.asPromise();
    console.log('✅ Connected to MongoDB');
    
    // Đọc file JSON
    const dataPath = path.join(__dirname, '../../../data/output.json');
    console.log(`📂 Reading file: ${dataPath}`);
    
    const data = await fs.readFile(dataPath, 'utf8');
    const profiles = JSON.parse(data);
    
    console.log(`📊 Found ${profiles.length} profiles to import`);
    
    let imported = 0;
    let skipped = 0;
    let errors = [];
    
    // Hàm chuẩn hoá URL để tránh duplicate do query params / trailing slash
    function normalizeUrl(raw) {
      if (!raw) return '';
      try {
        // Ensure absolute
        let urlStr = raw.toString().trim();
        if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;
        const u = new URL(urlStr);
        // Lowercase host, remove query and hash, remove trailing slash
        let pathname = u.pathname.replace(/\/+$/, '');
        const normalized = `${u.protocol}//${u.hostname.toLowerCase()}${pathname}`;
        return normalized;
      } catch (e) {
        return raw;
      }
    }

    // Import từng profile
    for (const [index, profile] of profiles.entries()) {
      try {
        // Normalize url và chuẩn bị upsert filter
        const rawUrl = profile.url || profile.linkedin_url || '';
        const normalized = normalizeUrl(rawUrl);

        // Tính điểm
        const score = calculateScore(profile);

        // Trích xuất kỹ năng
        const skills = extractSkills(profile);

        // Phân loại bằng cấp
        const educationWithLevel = (profile.education || []).map(edu => ({
          ...edu,
          degree_level: classifyDegree(edu.degree)
        }));

        // Upsert bằng normalized_url để tránh duplicates
        const filter = normalized ? { normalized_url: normalized } : { linkedin_url: rawUrl };
        const update = {
          $set: {
            name: profile.name,
            location: profile.location,
            job_title: profile.job_title,
            total_experience_count: profile.total_experience_count || 0,
            linkedin_url: rawUrl,
            normalized_url: normalized,
            education: educationWithLevel,
            experience: profile.experience || [],
            score: score,
            skills: skills,
            crawled_at: new Date()
          }
        };

        try {
          const resUp = await Candidate.updateOne(filter, update, { upsert: true });
          if (resUp.upsertedCount && resUp.upsertedCount > 0) imported++;
          else if (resUp.matchedCount && resUp.matchedCount > 0) skipped++;
          console.log(`✅ [${index + 1}/${profiles.length}] Upserted/Matched: ${profile.name}`);
        } catch (e) {
          // handle duplicate key or other errors
          if (e.code === 11000) {
            skipped++;
            console.warn(`⏩ [${index + 1}/${profiles.length}] Duplicate key for ${profile.name}: ${e.message}`);
          } else {
            throw e;
          }
        }
        
        // Chờ một chút để không overload
        if ((index + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`❌ [${index + 1}/${profiles.length}] Error importing ${profile.name}:`, error.message);
        errors.push({ profile: profile.name, error: error.message });
      }
    }
    
    console.log('\n🎉 Import Summary:');
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ⏩ Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n📋 Error details:');
      errors.forEach(err => {
        console.log(`   - ${err.profile}: ${err.error}`);
      });
    }
    
    // Thống kê
    const total = await Candidate.countDocuments();
    console.log(`\n📊 Total candidates in database: ${total}`);
    
    // Top 5 candidates by score
    const topCandidates = await Candidate.find()
      .sort({ score: -1 })
      .limit(5)
      .select('name job_title score total_experience_count');
    
    console.log('\n🏆 Top 5 Candidates by Score:');
    topCandidates.forEach((candidate, i) => {
      console.log(`   ${i + 1}. ${candidate.name} - ${candidate.job_title} (Score: ${candidate.score}, Exp: ${candidate.total_experience_count} yrs)`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Hàm tính điểm
function calculateScore(profile) {
  let score = 0;
  
  // Điểm kinh nghiệm (0-40 điểm)
  const expScore = Math.min((profile.total_experience_count || 0) * 4, 40);
  score += expScore;
  
  // Điểm học vấn (0-30 điểm)
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
  
  // Điểm số lượng kinh nghiệm làm việc (0-20 điểm)
  const expCount = profile.experience?.length || 0;
  score += Math.min(expCount * 2, 20);
  
  // Điểm kỹ năng (0-10 điểm)
  const skills = extractSkills(profile);
  score += Math.min(skills.length * 0.5, 10);
  
  return Math.round(score);
}

// Trích xuất kỹ năng từ profile
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
      // Format keyword: python -> Python, node.js -> Node.js
      const formatted = keyword.split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('.');
      skills.add(formatted);
    }
  });
  
  return Array.from(skills);
}

// Phân loại bằng cấp
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

// Chạy import
importData();