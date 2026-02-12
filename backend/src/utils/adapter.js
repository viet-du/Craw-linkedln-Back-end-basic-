const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

let mongooseModel = null;
let inMemoryData = [];
let dataLoaded = false;

class DataAdapter {
  constructor() {
    this.model = null;
    this.data = [];
    this.dataLoaded = false;
  }

  async loadFromFile(candidatePath) {
    try {
      logger.info(`Attempting to load data from: ${candidatePath}`);
      
      // Check if file exists
      try {
        await fs.access(candidatePath);
      } catch (err) {
        logger.warn(`File not found: ${candidatePath}`);
        return false;
      }
      
      const data = await fs.readFile(candidatePath, 'utf8');
      const profiles = JSON.parse(data);
      
      logger.info(`Found ${profiles.length} profiles in file`);
      
      inMemoryData = profiles.map((p, index) => ({
        _id: `file_${index}_${Date.now()}`,
        name: p.name || p.fullName || `Candidate ${index + 1}`,
        job_title: p.job_title || p.jobTitle || '',
        location: p.location || p.city || '',
        total_experience_count: p.total_experience_count || p.total_experience || 0,
        linkedin_url: p.url || p.linkedin_url || '',
        normalized_url: this.normalizeUrl(p.url || p.linkedin_url || ''),
        education: this.normalizeEducation(p.education || []),
        experience: this.normalizeExperience(p.experience || []),
        score: this.calculateScore(p),
        skills: this.extractSkills(p),
        crawled_at: p.crawled_at ? new Date(p.crawled_at) : new Date(),
        updated_at: new Date(),
        status: 'active',
        data_quality_score: this.calculateQualityScore(p)
      }));
      
      dataLoaded = true;
      logger.info(`Successfully loaded ${inMemoryData.length} candidates from file`);
      return true;
    } catch (err) {
      logger.error('Error loading data from file:', err.message);
      return false;
    }
  }

  setMongooseModel(model) {
    mongooseModel = model;
    logger.info('Mongoose model set for adapter');
  }

  normalizeEducation(education) {
    if (!Array.isArray(education)) return [];
    
    return education.map(edu => ({
      school: edu.school || '',
      degree: edu.degree || '',
      duration: edu.duration || '',
      degree_level: this.classifyDegree(edu.degree)
    })).filter(edu => edu.school || edu.degree);
  }

  normalizeExperience(experience) {
    if (!Array.isArray(experience)) return [];
    
    return experience.map(exp => ({
      position: exp.position || '',
      company: exp.company || '',
      employment_type: exp.employment_type || 'Full-time',
      duration: exp.duration || '',
      duration_months: this.parseDurationToMonths(exp.duration)
    })).filter(exp => exp.position || exp.company);
  }

  parseDurationToMonths(duration) {
    if (!duration) return 0;
    
    // Try to parse duration like "2 years 3 months" or "2018-2020"
    let months = 0;
    
    // Pattern for "X years Y months"
    const yearMatch = duration.match(/(\d+)\s*years?/i);
    const monthMatch = duration.match(/(\d+)\s*months?/i);
    
    if (yearMatch) months += parseInt(yearMatch[1]) * 12;
    if (monthMatch) months += parseInt(monthMatch[1]);
    
    // Pattern for date range "Jan 2018 - Dec 2020"
    const dateRangeMatch = duration.match(/(\d{4})\D+(\d{4})/);
    if (dateRangeMatch) {
      const startYear = parseInt(dateRangeMatch[1]);
      const endYear = parseInt(dateRangeMatch[2]);
      months = (endYear - startYear) * 12;
    }
    
    return months;
  }

  normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    
    try {
      let urlStr = rawUrl.toString().trim();
      if (!/^https?:\/\//i.test(urlStr)) {
        urlStr = 'https://' + urlStr;
      }
      
      const url = new URL(urlStr);
      let pathname = url.pathname.replace(/\/+$/, '');
      
      return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
    } catch (e) {
      return rawUrl;
    }
  }

  classifyDegree(degree) {
    if (!degree) return 'Other';
    
    const degreeLower = degree.toLowerCase();
    
    if (degreeLower.includes('phd') || degreeLower.includes('doctor')) return 'PhD';
    if (degreeLower.includes('master')) return 'Master';
    if (degreeLower.includes('mba')) return 'MBA';
    if (degreeLower.includes('bachelor') || degreeLower.includes('b.s.') || degreeLower.includes('b.a.')) return 'Bachelor';
    if (degreeLower.includes('high school')) return 'High School';
    
    return 'Other';
  }

  extractSkills(profile) {
    const skills = new Set();
    
    // Extract from job title
    if (profile.job_title) {
      this.extractSkillsFromText(profile.job_title, skills);
    }
    
    // Extract from experience
    if (profile.experience && Array.isArray(profile.experience)) {
      profile.experience.forEach(exp => {
        if (exp.position) this.extractSkillsFromText(exp.position, skills);
        if (exp.company) this.extractSkillsFromText(exp.company, skills);
      });
    }
    
    // Extract from education
    if (profile.education && Array.isArray(profile.education)) {
      profile.education.forEach(edu => {
        if (edu.degree) this.extractSkillsFromText(edu.degree, skills);
        if (edu.school) this.extractSkillsFromText(edu.school, skills);
      });
    }
    
    // Extract from provided skills array
    if (profile.skills && Array.isArray(profile.skills)) {
      profile.skills.forEach(skill => {
        if (skill && typeof skill === 'string') {
          skills.add(this.formatSkill(skill));
        }
      });
    }
    
    return Array.from(skills).slice(0, 20); // Limit to 20 skills
  }

  extractSkillsFromText(text, skillsSet) {
    if (!text) return;
    
    const textLower = text.toLowerCase();
    const techKeywords = [
      'python', 'javascript', 'java', 'c++', 'c#', 'react', 'node.js', 'nodejs',
      'aws', 'azure', 'docker', 'kubernetes', 'machine learning', 'ml',
      'ai', 'data science', 'sql', 'nosql', 'devops', 'frontend', 'backend',
      'typescript', 'go', 'rust', 'swift', 'kotlin', 'flutter',
      'react native', 'vue.js', 'angular', 'spring', 'django', 'flask',
      'mongodb', 'postgresql', 'mysql', 'redis', 'graphql', 'rest api',
      'html', 'css', 'sass', 'less', 'webpack', 'git', 'jenkins',
      'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy'
    ];
    
    techKeywords.forEach(keyword => {
      if (textLower.includes(keyword)) {
        skillsSet.add(this.formatSkill(keyword));
      }
    });
  }

  formatSkill(skill) {
    return skill.split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('.')
      .trim();
  }

  calculateScore(profile) {
    let score = 0;
    
    // Experience points (0-40)
    const expCount = profile.total_experience_count || 0;
    score += Math.min(expCount * 4, 40);
    
    // Education points (0-30)
    const education = profile.education || [];
    let eduScore = 0;
    education.forEach(edu => {
      const level = this.classifyDegree(edu.degree);
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
    const expEntries = profile.experience?.length || 0;
    score += Math.min(expEntries * 2, 20);
    
    // Skills points (0-10)
    const skills = this.extractSkills(profile);
    score += Math.min(skills.length * 0.5, 10);
    
    return Math.round(score);
  }

  calculateQualityScore(profile) {
    let score = 0;
    
    if (profile.name && profile.name.trim()) score += 20;
    if (profile.job_title && profile.job_title.trim()) score += 20;
    if (profile.linkedin_url) score += 10;
    
    if (profile.experience && profile.experience.length > 0) {
      score += Math.min(profile.experience.length * 5, 25);
    }
    
    if (profile.education && profile.education.length > 0) {
      score += Math.min(profile.education.length * 5, 15);
    }
    
    const skills = this.extractSkills(profile);
    if (skills.length > 0) {
      score += Math.min(skills.length * 2, 10);
    }
    
    return score;
  }

  buildFilterFn(filter) {
    return (candidate) => {
      if (!filter || Object.keys(filter).length === 0) return true;
      
      // Handle $or conditions
      if (filter.$or && Array.isArray(filter.$or)) {
        return filter.$or.some(condition => {
          // Name regex match
          if (condition.name && condition.name.$regex) {
            const re = new RegExp(condition.name.$regex, condition.name.$options || 'i');
            if (re.test(candidate.name || '')) return true;
          }
          
          // Job title regex match
          if (condition.job_title && condition.job_title.$regex) {
            const re = new RegExp(condition.job_title.$regex, condition.job_title.$options || 'i');
            if (re.test(candidate.job_title || '')) return true;
          }
          
          // Location regex match
          if (condition.location && condition.location.$regex) {
            const re = new RegExp(condition.location.$regex, condition.location.$options || 'i');
            if (re.test(candidate.location || '')) return true;
          }
          
          // Skills regex match
          if (condition.skills && condition.skills.$in) {
            const regex = condition.skills.$in[0];
            const re = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
            if ((candidate.skills || []).some(s => re.test(s))) return true;
          }
          
          return false;
        });
      }
      
      // Handle direct field matches
      for (const [key, value] of Object.entries(filter)) {
        if (key === 'skills' && Array.isArray(value)) {
          if (!value.every(skill => (candidate.skills || []).includes(skill))) {
            return false;
          }
        } else if (candidate[key] !== value) {
          return false;
        }
      }
      
      return true;
    };
  }

  async findCandidates(filter = {}, options = {}) {
    try {
      if (mongooseModel) {
        let query = mongooseModel.find(filter);
        
        if (options.sort) {
          const sortObj = {};
          Object.entries(options.sort).forEach(([key, value]) => {
            sortObj[key] = value === 1 ? 'asc' : 'desc';
          });
          query = query.sort(sortObj);
        }
        
        if (typeof options.skip === 'number') {
          query = query.skip(options.skip);
        }
        
        if (typeof options.limit === 'number') {
          query = query.limit(options.limit);
        }
        
        if (options.select) {
          query = query.select(options.select);
        }
        
        return await query.exec();
      }
      
      // Fallback to in-memory data
      if (!dataLoaded) {
        logger.warn('No data loaded in adapter');
        return [];
      }
      
      const filterFn = this.buildFilterFn(filter);
      let results = inMemoryData.filter(filterFn);
      
      // Apply sorting
      if (options.sort) {
        const sortKey = Object.keys(options.sort)[0];
        const sortDirection = options.sort[sortKey];
        
        results.sort((a, b) => {
          const aVal = a[sortKey] || 0;
          const bVal = b[sortKey] || 0;
          
          if (sortDirection === 1 || sortDirection === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
          }
        });
      }
      
      // Apply pagination
      const skip = options.skip || 0;
      const limit = options.limit || results.length;
      
      return results.slice(skip, skip + limit);
    } catch (error) {
      logger.error('Error in findCandidates:', error);
      throw error;
    }
  }

  async countDocuments(filter = {}) {
    try {
      if (mongooseModel) {
        return await mongooseModel.countDocuments(filter).exec();
      }
      
      if (!dataLoaded) return 0;
      
      const filterFn = this.buildFilterFn(filter);
      return inMemoryData.filter(filterFn).length;
    } catch (error) {
      logger.error('Error in countDocuments:', error);
      throw error;
    }
  }

  async getTopByExperience(limit = 10) {
    try {
      if (mongooseModel) {
        return await mongooseModel.find()
          .sort({ total_experience_count: -1, score: -1 })
          .limit(limit)
          .exec();
      }
      
      if (!dataLoaded) return [];
      
      return inMemoryData
        .slice()
        .sort((a, b) => {
          const expDiff = (b.total_experience_count || 0) - (a.total_experience_count || 0);
          return expDiff !== 0 ? expDiff : (b.score || 0) - (a.score || 0);
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Error in getTopByExperience:', error);
      throw error;
    }
  }

  async getTopByEducation(limit = 10) {
    try {
      if (mongooseModel) {
        return await mongooseModel.find({
          'education.degree_level': { $in: ['PhD', 'Master', 'MBA'] }
        })
        .sort({ score: -1 })
        .limit(limit)
        .exec();
      }
      
      if (!dataLoaded) return [];
      
      return inMemoryData
        .filter(candidate => 
          (candidate.education || []).some(edu => 
            ['PhD', 'Master', 'MBA'].includes(edu.degree_level)
          )
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);
    } catch (error) {
      logger.error('Error in getTopByEducation:', error);
      throw error;
    }
  }

  async getStatistics() {
    try {
      if (mongooseModel) {
        const Candidate = mongooseModel;
        const totalCandidates = await Candidate.countDocuments();
        const avgExperience = await Candidate.aggregate([
          { $group: { _id: null, avg: { $avg: '$total_experience_count' } } }
        ]);
        const avgScore = await Candidate.aggregate([
          { $group: { _id: null, avg: { $avg: '$score' } } }
        ]);
        const avgQuality = await Candidate.aggregate([
          { $group: { _id: null, avg: { $avg: '$data_quality_score' } } }
        ]);
        
        const topSkills = await Candidate.aggregate([
          { $unwind: '$skills' },
          { $group: { _id: '$skills', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]);
        
        const topLocations = await Candidate.aggregate([
          { $match: { location: { $ne: null, $ne: '' } } },
          { $group: { _id: '$location', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]);
        
        const educationStats = await Candidate.aggregate([
          { $unwind: '$education' },
          { $group: { 
            _id: '$education.degree_level', 
            count: { $sum: 1 },
            avgScore: { $avg: '$score' }
          } },
          { $sort: { count: -1 } }
        ]);
        
        const experienceDistribution = await Candidate.aggregate([
          { $bucket: {
            groupBy: '$total_experience_count',
            boundaries: [0, 3, 5, 10, 15, 20, 100],
            default: '20+',
            output: {
              count: { $sum: 1 },
              avgScore: { $avg: '$score' }
            }
          }},
          { $sort: { _id: 1 } }
        ]);
        
        return {
          totalCandidates,
          avgExperience: avgExperience[0]?.avg || 0,
          avgScore: avgScore[0]?.avg || 0,
          avgQuality: avgQuality[0]?.avg || 0,
          topSkills,
          topLocations,
          educationStats,
          experienceDistribution
        };
      }
      
      if (!dataLoaded || inMemoryData.length === 0) {
        return {
          totalCandidates: 0,
          avgExperience: 0,
          avgScore: 0,
          avgQuality: 0,
          topSkills: [],
          topLocations: [],
          educationStats: [],
          experienceDistribution: []
        };
      }
      
      const totalCandidates = inMemoryData.length;
      const avgExperience = inMemoryData.reduce((sum, c) => sum + (c.total_experience_count || 0), 0) / totalCandidates;
      const avgScore = inMemoryData.reduce((sum, c) => sum + (c.score || 0), 0) / totalCandidates;
      const avgQuality = inMemoryData.reduce((sum, c) => sum + (c.data_quality_score || 0), 0) / totalCandidates;
      
      const skillsCount = {};
      inMemoryData.forEach(c => {
        (c.skills || []).forEach(skill => {
          skillsCount[skill] = (skillsCount[skill] || 0) + 1;
        });
      });
      const topSkills = Object.entries(skillsCount)
        .map(([_id, count]) => ({ _id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      const locCount = {};
      inMemoryData.forEach(c => {
        const location = c.location || 'Unknown';
        locCount[location] = (locCount[location] || 0) + 1;
      });
      const topLocations = Object.entries(locCount)
        .map(([_id, count]) => ({ _id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      const eduCount = {};
      inMemoryData.forEach(c => {
        (c.education || []).forEach(edu => {
          const level = edu.degree_level || 'Other';
          eduCount[level] = (eduCount[level] || 0) + 1;
        });
      });
      const educationStats = Object.entries(eduCount)
        .map(([_id, count]) => ({ _id, count }))
        .sort((a, b) => b.count - a.count);
      
      const experienceDistribution = [
        { _id: 0, count: inMemoryData.filter(c => (c.total_experience_count || 0) < 3).length },
        { _id: 3, count: inMemoryData.filter(c => (c.total_experience_count || 0) >= 3 && (c.total_experience_count || 0) < 5).length },
        { _id: 5, count: inMemoryData.filter(c => (c.total_experience_count || 0) >= 5 && (c.total_experience_count || 0) < 10).length },
        { _id: 10, count: inMemoryData.filter(c => (c.total_experience_count || 0) >= 10 && (c.total_experience_count || 0) < 15).length },
        { _id: 15, count: inMemoryData.filter(c => (c.total_experience_count || 0) >= 15 && (c.total_experience_count || 0) < 20).length },
        { _id: 20, count: inMemoryData.filter(c => (c.total_experience_count || 0) >= 20).length }
      ].filter(bucket => bucket.count > 0);
      
      return {
        totalCandidates,
        avgExperience,
        avgScore,
        avgQuality,
        topSkills,
        topLocations,
        educationStats,
        experienceDistribution
      };
    } catch (error) {
      logger.error('Error in getStatistics:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      if (mongooseModel) {
        return await mongooseModel.findById(id).exec();
      }
      
      if (!dataLoaded) return null;
      
      return inMemoryData.find(candidate => candidate._id === id) || null;
    } catch (error) {
      logger.error('Error in findById:', error);
      throw error;
    }
  }

  async create(candidateData) {
    try {
      if (mongooseModel) {
        return await mongooseModel.create(candidateData);
      }
      
      const newCandidate = {
        _id: `file_${inMemoryData.length}_${Date.now()}`,
        ...candidateData,
        crawled_at: new Date(),
        updated_at: new Date()
      };
      
      inMemoryData.push(newCandidate);
      return newCandidate;
    } catch (error) {
      logger.error('Error in create:', error);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      if (mongooseModel) {
        return await mongooseModel.findByIdAndUpdate(
          id, 
          { ...updateData, updated_at: new Date() }, 
          { new: true, runValidators: true }
        ).exec();
      }
      
      if (!dataLoaded) return null;
      
      const index = inMemoryData.findIndex(candidate => candidate._id === id);
      if (index === -1) return null;
      
      inMemoryData[index] = {
        ...inMemoryData[index],
        ...updateData,
        updated_at: new Date()
      };
      
      return inMemoryData[index];
    } catch (error) {
      logger.error('Error in update:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      if (mongooseModel) {
        return await mongooseModel.findByIdAndDelete(id).exec();
      }
      
      if (!dataLoaded) return null;
      
      const index = inMemoryData.findIndex(candidate => candidate._id === id);
      if (index === -1) return null;
      
      const deleted = inMemoryData.splice(index, 1);
      return deleted[0];
    } catch (error) {
      logger.error('Error in delete:', error);
      throw error;
    }
  }
}

module.exports = new DataAdapter();