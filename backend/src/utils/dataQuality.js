const { logger } = require('./logger');

class DataQualityChecker {
  static validateProfile(profile) {
    const errors = [];
    const warnings = [];
    
    // Required fields validation
    if (!profile.name || profile.name.trim() === '') {
      errors.push('Name is required');
    } else if (profile.name.length < 2) {
      errors.push('Name must be at least 2 characters long');
    } else if (profile.name.length > 100) {
      warnings.push('Name is unusually long');
    }
    
    if (!profile.job_title || profile.job_title.trim() === '') {
      errors.push('Job title is required');
    }
    
    // LinkedIn URL validation
    if (profile.linkedin_url) {
      const urlError = this.validateLinkedInUrl(profile.linkedin_url);
      if (urlError) errors.push(urlError);
    } else {
      warnings.push('LinkedIn URL is missing');
    }
    
    // Email validation (if present)
    if (profile.email && !this.isValidEmail(profile.email)) {
      errors.push('Invalid email format');
    }
    
    // Experience validation
    if (profile.experience && Array.isArray(profile.experience)) {
      profile.experience.forEach((exp, index) => {
        const expErrors = this.validateExperience(exp, index);
        errors.push(...expErrors.errors);
        warnings.push(...expErrors.warnings);
      });
    }
    
    // Education validation
    if (profile.education && Array.isArray(profile.education)) {
      profile.education.forEach((edu, index) => {
        const eduErrors = this.validateEducation(edu, index);
        errors.push(...eduErrors.errors);
        warnings.push(...eduErrors.warnings);
      });
    }
    
    // Skills validation
    if (profile.skills && Array.isArray(profile.skills)) {
      const skillsErrors = this.validateSkills(profile.skills);
      errors.push(...skillsErrors.errors);
      warnings.push(...skillsErrors.warnings);
    }
    
    // Check for suspicious data
    const suspiciousChecks = this.checkSuspiciousData(profile);
    warnings.push(...suspiciousChecks);
    
    // Calculate data quality score
    const qualityScore = this.calculateQualityScore(profile, errors.length);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      qualityScore,
      summary: {
        totalChecks: errors.length + warnings.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        score: qualityScore
      }
    };
  }
  
  static validateLinkedInUrl(url) {
    if (!url) return 'URL is required';
    
    // Basic URL format check
    try {
      new URL(url);
    } catch (e) {
      return 'Invalid URL format';
    }
    
    // LinkedIn domain check
    if (!url.includes('linkedin.com/in/')) {
      return 'URL must be a LinkedIn profile (linkedin.com/in/)';
    }
    
    // Check for common issues
    if (url.includes('/pub/') || url.includes('/dir/')) {
      return 'URL appears to be a directory or public profile, not a personal profile';
    }
    
    // Check length (LinkedIn URLs typically under 100 chars)
    if (url.length > 150) {
      return 'URL is unusually long';
    }
    
    return null;
  }
  
  static validateExperience(experience, index) {
    const errors = [];
    const warnings = [];
    
    if (!experience.position || experience.position.trim() === '') {
      errors.push(`Experience ${index + 1}: Position is required`);
    } else if (experience.position.length > 200) {
      warnings.push(`Experience ${index + 1}: Position is unusually long`);
    }
    
    if (!experience.company || experience.company.trim() === '') {
      errors.push(`Experience ${index + 1}: Company is required`);
    }
    
    // Check for suspicious duration
    if (experience.duration) {
      const durationCheck = this.checkDuration(experience.duration);
      if (durationCheck.isSuspicious) {
        warnings.push(`Experience ${index + 1}: ${durationCheck.message}`);
      }
    }
    
    // Check for future dates
    if (experience.start_date && new Date(experience.start_date) > new Date()) {
      warnings.push(`Experience ${index + 1}: Start date is in the future`);
    }
    
    if (experience.end_date && experience.end_date !== 'Present') {
      const endDate = new Date(experience.end_date);
      if (endDate > new Date()) {
        warnings.push(`Experience ${index + 1}: End date is in the future`);
      }
    }
    
    return { errors, warnings };
  }
  
  static validateEducation(education, index) {
    const errors = [];
    const warnings = [];
    
    if (!education.school || education.school.trim() === '') {
      errors.push(`Education ${index + 1}: School is required`);
    } else if (education.school.length > 200) {
      warnings.push(`Education ${index + 1}: School name is unusually long`);
    }
    
    if (!education.degree || education.degree.trim() === '') {
      warnings.push(`Education ${index + 1}: Degree is missing`);
    }
    
    // Validate degree level
    if (education.degree_level) {
      const validLevels = ['High School', 'Bachelor', 'Master', 'PhD', 'MBA', 'Other'];
      if (!validLevels.includes(education.degree_level)) {
        warnings.push(`Education ${index + 1}: Invalid degree level "${education.degree_level}"`);
      }
    }
    
    // Check for suspicious duration
    if (education.duration) {
      const durationCheck = this.checkDuration(education.duration);
      if (durationCheck.isSuspicious) {
        warnings.push(`Education ${index + 1}: ${durationCheck.message}`);
      }
    }
    
    return { errors, warnings };
  }
  
  static validateSkills(skills) {
    const errors = [];
    const warnings = [];
    
    if (!Array.isArray(skills)) {
      errors.push('Skills must be an array');
      return { errors, warnings };
    }
    
    if (skills.length === 0) {
      warnings.push('No skills listed');
    }
    
    if (skills.length > 50) {
      warnings.push('Unusually high number of skills (over 50)');
    }
    
    // Check for duplicates
    const uniqueSkills = [...new Set(skills.map(s => s.toLowerCase().trim()))];
    if (uniqueSkills.length !== skills.length) {
      warnings.push(`Found ${skills.length - uniqueSkills.length} duplicate skills`);
    }
    
    // Check for empty or invalid skills
    skills.forEach((skill, index) => {
      if (!skill || typeof skill !== 'string') {
        errors.push(`Skill ${index + 1}: Must be a non-empty string`);
      } else if (skill.trim() === '') {
        errors.push(`Skill ${index + 1}: Cannot be empty`);
      } else if (skill.length > 100) {
        warnings.push(`Skill ${index + 1}: "${skill.substring(0, 30)}..." is unusually long`);
      }
    });
    
    return { errors, warnings };
  }
  
  static checkDuration(duration) {
    if (!duration) return { isSuspicious: false, message: '' };
    
    duration = duration.toLowerCase();
    
    // Check for impossibly long durations
    const yearMatch = duration.match(/(\d+)\s*years?/);
    if (yearMatch) {
      const years = parseInt(yearMatch[1]);
      if (years > 50) {
        return { isSuspicious: true, message: `Duration of ${years} years is unusually long` };
      }
    }
    
    // Check for overlapping or impossible date ranges
    const dateRangeMatch = duration.match(/(\d{4})\D+(\d{4})/);
    if (dateRangeMatch) {
      const startYear = parseInt(dateRangeMatch[1]);
      const endYear = parseInt(dateRangeMatch[2]);
      
      if (startYear > endYear) {
        return { isSuspicious: true, message: 'Start year is after end year' };
      }
      
      if (endYear - startYear > 50) {
        return { isSuspicious: true, message: 'Date range spans more than 50 years' };
      }
    }
    
    // Check for "present" with end year
    if (duration.includes('present') && dateRangeMatch) {
      return { isSuspicious: true, message: 'Cannot have "Present" with an end year' };
    }
    
    return { isSuspicious: false, message: '' };
  }
  
  static checkSuspiciousData(profile) {
    const warnings = [];
    
    // Check for too many experience entries
    if (profile.experience && profile.experience.length > 20) {
      warnings.push(`Unusually high number of experience entries (${profile.experience.length})`);
    }
    
    // Check for too many education entries
    if (profile.education && profile.education.length > 10) {
      warnings.push(`Unusually high number of education entries (${profile.education.length})`);
    }
    
    // Check for suspicious job titles
    if (profile.job_title) {
      const suspiciousTitles = [
        'ceo', 'founder', 'director', 'manager', 'lead', 'senior',
        'principal', 'architect', 'consultant', 'specialist'
      ];
      
      const titleLower = profile.job_title.toLowerCase();
      const matches = suspiciousTitles.filter(word => titleLower.includes(word));
      
      if (matches.length > 3) {
        warnings.push('Job title contains multiple seniority indicators');
      }
    }
    
    // Check for location anomalies
    if (profile.location) {
      const location = profile.location.toLowerCase();
      
      // Check for fake or test locations
      const fakeLocations = ['test', 'example', 'sample', 'none', 'unknown', 'n/a'];
      if (fakeLocations.some(fake => location.includes(fake))) {
        warnings.push('Location appears to be placeholder text');
      }
      
      // Check for unusually formatted locations
      if (location.includes('@') || location.includes('http')) {
        warnings.push('Location contains unusual characters');
      }
    }
    
    // Check for duplicate information
    if (profile.name && profile.job_title && profile.name === profile.job_title) {
      warnings.push('Name and job title are identical');
    }
    
    return warnings;
  }
  
  static calculateQualityScore(profile, errorCount) {
    let score = 100;
    
    // Deduct points for errors
    score -= errorCount * 10;
    
    // Add points for completeness
    if (profile.name && profile.name.trim()) score += 5;
    if (profile.job_title && profile.job_title.trim()) score += 5;
    if (profile.location && profile.location.trim()) score += 5;
    if (profile.linkedin_url) score += 10;
    
    // Add points for experience
    if (profile.experience && profile.experience.length > 0) {
      score += Math.min(profile.experience.length * 2, 20);
    }
    
    // Add points for education
    if (profile.education && profile.education.length > 0) {
      score += Math.min(profile.education.length * 3, 15);
    }
    
    // Add points for skills
    if (profile.skills && profile.skills.length > 0) {
      score += Math.min(profile.skills.length, 10);
    }
    
    // Bonus for detailed experience
    if (profile.experience) {
      const detailedExpCount = profile.experience.filter(exp => 
        exp.description && exp.description.trim().length > 20
      ).length;
      score += Math.min(detailedExpCount * 2, 10);
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  static validateBatchProfiles(profiles) {
    const results = {
      total: profiles.length,
      valid: 0,
      invalid: 0,
      warnings: 0,
      qualityScores: [],
      details: []
    };
    
    profiles.forEach((profile, index) => {
      const validation = this.validateProfile(profile);
      
      results.details.push({
        index,
        name: profile.name || `Profile ${index + 1}`,
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        qualityScore: validation.qualityScore,
        errors: validation.errors,
        warnings: validation.warnings
      });
      
      if (validation.isValid) {
        results.valid++;
      } else {
        results.invalid++;
      }
      
      if (validation.warnings.length > 0) {
        results.warnings++;
      }
      
      results.qualityScores.push(validation.qualityScore);
    });
    
    // Calculate average quality score
    if (results.qualityScores.length > 0) {
      results.averageQualityScore = Math.round(
        results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length
      );
    } else {
      results.averageQualityScore = 0;
    }
    
    return results;
  }
  
  static generateDataQualityReport(profiles) {
    const batchValidation = this.validateBatchProfiles(profiles);
    
    const report = {
      summary: {
        totalProfiles: batchValidation.total,
        validProfiles: batchValidation.valid,
        invalidProfiles: batchValidation.invalid,
        profilesWithWarnings: batchValidation.warnings,
        averageQualityScore: batchValidation.averageQualityScore,
        validationRate: Math.round((batchValidation.valid / batchValidation.total) * 100)
      },
      commonErrors: {},
      commonWarnings: {},
      qualityDistribution: {
        excellent: 0, // 90-100
        good: 0,      // 70-89
        fair: 0,      // 50-69
        poor: 0       // 0-49
      },
      recommendations: []
    };
    
    // Count common errors and warnings
    batchValidation.details.forEach(detail => {
      // Count quality distribution
      if (detail.qualityScore >= 90) report.qualityDistribution.excellent++;
      else if (detail.qualityScore >= 70) report.qualityDistribution.good++;
      else if (detail.qualityScore >= 50) report.qualityDistribution.fair++;
      else report.qualityDistribution.poor++;
      
      // Count errors
      detail.errors.forEach(error => {
        const errorKey = error.split(':')[0] || error;
        report.commonErrors[errorKey] = (report.commonErrors[errorKey] || 0) + 1;
      });
      
      // Count warnings
      detail.warnings.forEach(warning => {
        const warningKey = warning.split(':')[0] || warning;
        report.commonWarnings[warningKey] = (report.commonWarnings[warningKey] || 0) + 1;
      });
    });
    
    // Sort common issues
    report.commonErrors = Object.entries(report.commonErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    
    report.commonWarnings = Object.entries(report.commonWarnings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    
    // Generate recommendations
    if (report.summary.validationRate < 80) {
      report.recommendations.push('Improve data collection to increase validation rate');
    }
    
    if (report.qualityDistribution.poor > report.total * 0.3) {
      report.recommendations.push('Address low-quality profiles to improve overall data quality');
    }
    
    if (Object.keys(report.commonErrors).length > 0) {
      const topError = Object.keys(report.commonErrors)[0];
      report.recommendations.push(`Fix the most common error: "${topError}"`);
    }
    
    return report;
  }
}

module.exports = DataQualityChecker;