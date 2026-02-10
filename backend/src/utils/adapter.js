const fs = require('fs').promises;
const path = require('path');

let mongooseModel = null;
let inMemoryData = [];

async function loadFromFile(candidatePath) {
  try {
    const data = await fs.readFile(candidatePath, 'utf8');
    inMemoryData = JSON.parse(data);
    inMemoryData = inMemoryData.map(p => ({
      name: p.name || p.fullName || '',
      job_title: p.job_title || p.jobTitle || '',
      location: p.location || p.city || '',
      total_experience_count: p.total_experience_count || p.total_experience || 0,
      linkedin_url: p.url || p.linkedin_url || '',
      education: p.education || [],
      experience: p.experience || [],
      score: p.score || 0,
      skills: p.skills || [],
      crawled_at: p.crawled_at ? new Date(p.crawled_at) : new Date()
    }));
    console.log(`📥 Loaded ${inMemoryData.length} candidates from file`);
    return true;
  } catch (err) {
    console.warn('⚠️ Could not load data file:', candidatePath, err.message);
    return false;
  }
}

function setMongooseModel(model) {
  mongooseModel = model;
}

function buildFilterFn(filter) {
  return (c) => {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.$or && Array.isArray(filter.$or)) {
      return filter.$or.some(cond => {
        if (cond.name && cond.name.$regex) {
          const re = new RegExp(cond.name.$regex, cond.name.$options || 'i');
          if (re.test(c.name || '')) return true;
        }
        if (cond.job_title && cond.job_title.$regex) {
          const re = new RegExp(cond.job_title.$regex, cond.job_title.$options || 'i');
          if (re.test(c.job_title || '')) return true;
        }
        if (cond.location && cond.location.$regex) {
          const re = new RegExp(cond.location.$regex, cond.location.$options || 'i');
          if (re.test(c.location || '')) return true;
        }
        if (cond.skills && cond.skills.$in) {
          const regex = cond.skills.$in[0];
          const re = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
          if ((c.skills || []).some(s => re.test(s))) return true;
        }
        return false;
      });
    }
    return true;
  };
}

async function findCandidates(filter = {}, options = {}) {
  if (mongooseModel) {
    let q = mongooseModel.find(filter);
    if (options.sort) q = q.sort(options.sort);
    if (typeof options.skip === 'number') q = q.skip(options.skip);
    if (typeof options.limit === 'number') q = q.limit(options.limit);
    return q.exec();
  }

  const fn = buildFilterFn(filter);
  let arr = inMemoryData.filter(fn);

  if (options.sort) {
    const key = Object.keys(options.sort)[0];
    const dir = options.sort[key];
    arr.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  }

  const skip = options.skip || 0;
  const limit = options.limit || arr.length;
  return arr.slice(skip, skip + limit);
}

async function countDocuments(filter = {}) {
  if (mongooseModel) return mongooseModel.countDocuments(filter).exec();
  const fn = buildFilterFn(filter);
  return inMemoryData.filter(fn).length;
}

async function getTopByExperience(limit = 10) {
  if (mongooseModel) return mongooseModel.find().sort({ total_experience_count: -1, score: -1 }).limit(limit).exec();
  return inMemoryData.slice().sort((a,b) => (b.total_experience_count - a.total_experience_count) || (b.score - a.score)).slice(0, limit);
}

async function getTopByEducation(limit = 10) {
  if (mongooseModel) return mongooseModel.find({ 'education.degree_level': { $in: ['PhD','Master','MBA'] } }).sort({ score: -1 }).limit(limit).exec();
  return inMemoryData.filter(c => (c.education||[]).some(e => ['PhD','Master','MBA'].includes(e.degree_level))).sort((a,b) => b.score - a.score).slice(0, limit);
}

async function getStatistics() {
  if (mongooseModel) {
    return null;
  }

  const totalCandidates = inMemoryData.length;
  const avgExperience = (inMemoryData.reduce((s,c)=>s+(c.total_experience_count||0),0) / (totalCandidates || 1));
  const avgScore = (inMemoryData.reduce((s,c)=>s+(c.score||0),0) / (totalCandidates || 1));

  const skillsCount = {};
  inMemoryData.forEach(c => (c.skills||[]).forEach(s => skillsCount[s] = (skillsCount[s]||0)+1));
  const topSkills = Object.entries(skillsCount).map(([k,v])=>({ _id:k, count:v })).sort((a,b)=>b.count-a.count).slice(0,10);

  const locCount = {};
  inMemoryData.forEach(c => { const l = c.location || 'Unknown'; locCount[l] = (locCount[l]||0)+1; });
  const topLocations = Object.entries(locCount).map(([k,v])=>({ _id:k, count:v })).sort((a,b)=>b.count-a.count).slice(0,10);

  const eduCount = {};
  inMemoryData.forEach(c => (c.education||[]).forEach(e => { const lvl = e.degree_level || 'Other'; eduCount[lvl] = (eduCount[lvl]||0)+1; }));
  const educationStats = Object.entries(eduCount).map(([k,v])=>({ _id:k, count:v })).sort((a,b)=>b.count-a.count);

  return {
    totalCandidates,
    avgExperience,
    avgScore,
    topSkills,
    topLocations,
    educationStats
  };
}

module.exports = {
  loadFromFile,
  setMongooseModel,
  findCandidates,
  countDocuments,
  getTopByExperience,
  getTopByEducation,
  getStatistics,
  _inMemoryData: () => inMemoryData
};


