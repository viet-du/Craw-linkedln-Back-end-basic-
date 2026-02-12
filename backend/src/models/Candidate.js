const mongoose = require('mongoose');

const EducationSchema = new mongoose.Schema({
  school: {
    type: String,
    required: [true, 'School name is required'],
    trim: true,
    maxlength: [200, 'School name cannot exceed 200 characters']
  },
  degree: {
    type: String,
    trim: true,
    maxlength: [200, 'Degree cannot exceed 200 characters']
  },
  duration: {
    type: String,
    trim: true
  },
  degree_level: {
    type: String,
    enum: ['High School', 'Bachelor', 'Master', 'PhD', 'MBA', 'Other'],
    default: 'Other',
    index: true
  }
}, { _id: false });

const ExperienceSchema = new mongoose.Schema({
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true,
    maxlength: [200, 'Position cannot exceed 200 characters']
  },
  company: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  employment_type: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', 'Other'],
    default: 'Full-time'
  },
  duration: {
    type: String,
    trim: true
  },
  duration_months: {
    type: Number,
    min: 0,
    max: 1200
  }
}, { _id: false });

const CandidateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    index: true
  },
  location: {
    type: String,
    trim: true,
    index: true
  },
  job_title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    index: true
  },
  normalized_url: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+\..+/.test(v);
      },
      message: props => `${props.value} is not a valid URL!`
    }
  },
  total_experience_count: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    index: true
  },
  linkedin_url: {
  type: String,
  unique: true,
  index: true,
  validate: {
    validator: function(v) {
      return /^https?:\/\/(www\.)?linkedin\.com\/in\/[^\s\/]+(\/.*)?$/.test(v);
    },
    message: props => `${props.value} is not a valid LinkedIn URL!`
  }
},
  education: [EducationSchema],
  experience: [ExperienceSchema],
  score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    index: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  crawled_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'flagged'],
    default: 'active'
  },
  data_quality_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name (if needed)
CandidateSchema.virtual('full_name').get(function() {
  return this.name;
});

// Indexes for faster queries
CandidateSchema.index({ name: 'text', job_title: 'text', location: 'text' });
CandidateSchema.index({ total_experience_count: -1 });
CandidateSchema.index({ score: -1 });
CandidateSchema.index({ location: 1 });
CandidateSchema.index({ 'education.degree_level': 1 });
CandidateSchema.index({ skills: 1 });
CandidateSchema.index({ status: 1 });

// Pre-save middleware to update timestamps
CandidateSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Pre-save middleware to calculate data quality score
CandidateSchema.pre('save', function(next) {
  let qualityScore = 0;
  
  // Check required fields
  if (this.name && this.name.trim()) qualityScore += 20;
  if (this.job_title && this.job_title.trim()) qualityScore += 20;
  if (this.linkedin_url) qualityScore += 10;
  
  // Check experience
  if (this.experience && this.experience.length > 0) {
    qualityScore += Math.min(this.experience.length * 5, 25);
  }
  
  // Check education
  if (this.education && this.education.length > 0) {
    qualityScore += Math.min(this.education.length * 5, 15);
  }
  
  // Check skills
  if (this.skills && this.skills.length > 0) {
    qualityScore += Math.min(this.skills.length * 2, 10);
  }
  
  this.data_quality_score = qualityScore;
  next();
});

// Static method to find by skill
CandidateSchema.statics.findBySkill = function(skill) {
  return this.find({ skills: new RegExp(skill, 'i') });
};

// Static method to get statistics
CandidateSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        avgScore: { $avg: '$score' },
        avgExperience: { $avg: '$total_experience_count' },
        avgQuality: { $avg: '$data_quality_score' },
        minScore: { $min: '$score' },
        maxScore: { $max: '$score' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    avgScore: 0,
    avgExperience: 0,
    avgQuality: 0,
    minScore: 0,
    maxScore: 0
  };
};

// Instance method to get profile summary
CandidateSchema.methods.getSummary = function() {
  return {
    name: this.name,
    job_title: this.job_title,
    location: this.location,
    experience_count: this.total_experience_count,
    score: this.score,
    quality_score: this.data_quality_score,
    last_updated: this.updated_at
  };
};

module.exports = mongoose.model('Candidate', CandidateSchema);