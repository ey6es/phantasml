const path = require('path');

module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt); // npm install --save-dev load-grunt-tasks
  
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    babel: {
      dist: {
        options: {
          presets: ['env', 'react'],
        },
        files: [{
          expand: true,
          cwd: 'src',
          src: '**/*.js',
          dest: 'build/',
        }],
      }
    },
    browserify: {
      dist: {
        options: {
           transform: ['browserify-shim', 'uglifyify'],
        },        
        files: [{
          expand: true,
          cwd: 'build/client',
          src: 'exercises/*.js',
          dest: 'dist/',
          ext: '.min.js',
        }],
      }
    },
    replace: function() {
      var config = {};
      for (var name of grunt.file.expand({cwd: 'src/client/exercises'}, ['*.js'])) {
        var basename = path.basename(name, '.js');
        config[basename] = {
          options: {
            patterns: [{match: 'path', replacement: `${basename}.min.js`}],
          },
          src: 'src/client/exercises/template.html',
          dest: `dist/exercises/${basename}.html`,
        };
      }
      return config;
    }(),
  });

  // Default task(s).
  grunt.registerTask('default', ['babel', 'browserify', 'replace']);

};
