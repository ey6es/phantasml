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
          plugins: ['transform-class-properties', 'transform-runtime'],
        },
        files: [
          {
            expand: true,
            cwd: 'src',
            src: '**/*.js',
            dest: 'build/',
          },
        ],
      },
    },
    browserify: {
      exercises: {
        options: {
          transform: ['browserify-shim', 'uglifyify'],
        },
        files: [
          {
            expand: true,
            src: 'build/client/exercises/+([0-9])-*.js',
            ext: '.min.js',
          },
        ],
      },
      app: {
        options: {
          transform: ['uglifyify'],
        },
        src: 'build/client/app.js',
        dest: 'build/client/app.min.js',
      },
    },
    uglify: {
      exercises: {
        files: [
          {
            expand: true,
            cwd: 'build/client',
            src: 'exercises/+([0-9])-*.min.js',
            dest: 'dist/',
          },
        ],
      },
      app: {
        src: 'build/client/app.min.js',
        dest: 'dist/app.min.js',
      },
    },
    replace: (function() {
      var config = {};
      var filenames = grunt.file.expand({cwd: 'src/client/exercises'}, [
        '+([0-9])-*.js',
      ]);
      for (var name of filenames) {
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
    })(),
    copy: {
      dist: {
        src: 'src/client/index.html',
        dest: 'dist/index.html',
      },
    },
    less: {
      dist: {
        files: [
          {
            expand: true,
            cwd: 'src/client',
            src: '**/*.less',
            dest: 'dist/',
            ext: '.css',
          },
        ],
      },
    },
    watch: {
      dist: {
        files: 'src/**',
        tasks: 'default',
        options: {livereload: true},
      },
    },
    rsync: {
      dist: {
        options: {
          src: 'dist/',
          dest: '/usr/share/wordpress/phantasml',
          host: 'www.fungibleinsight.com',
          delete: true,
          recursive: true,
        },
      },
    },
  });

  // Default task(s).
  grunt.registerTask('default', [
    'babel',
    'browserify',
    'uglify',
    'replace',
    'copy',
    'less',
  ]);
};
