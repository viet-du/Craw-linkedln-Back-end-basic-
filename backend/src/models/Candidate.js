const mongoose = require('mongoose');

const EducationSchema = new mongoose.Schema({
  school: String,
  degree: String,
  duration: String,
  degree_level: {
    type: String,
    enum: ['High School', 'Bachelor', 'Master', 'PhD', 'MBA', 'Other'],
    default: 'Other'
  }
});

const ExperienceSchema = new mongoose.Schema({
  position: String,
  company: String,
  employment_type: String,
  duration: String,
  duration_months: Number
});

const CandidateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    index: true
  },
  location: String,
  job_title: {
    type: String,
    required: true,
    index: true
  },
  // normalized_url: canonical form of linkedin_url for deduplication
  normalized_url: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  total_experience_count: {
    type: Number,
    default: 0,
    index: true
  },
  linkedin_url: {
    type: String,
    unique: true,
    index: true
  },
  education: [EducationSchema],
  experience: [ExperienceSchema],
  score: {
    type: Number,
    default: 0,
    index: true
  },
  skills: [String],
  crawled_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Tạo indexes cho tìm kiếm nhanh
CandidateSchema.index({ name: 'text', job_title: 'text' });
CandidateSchema.index({ total_experience_count: -1 });
CandidateSchema.index({ score: -1 });
CandidateSchema.index({ location: 1 });
CandidateSchema.index({ 'education.degree_level': 1 });

module.exports = mongoose.model('Candidate', CandidateSchema);