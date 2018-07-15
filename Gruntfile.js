const path = require('path');

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt); // npm install --save-dev load-grunt-tasks

  // load our build configuration
  const config = grunt.file.readJSON('etc/build-config.json');
  const exerciseNames = [];

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
          transform: ['browserify-shim'],
        },
        files: [
          {
            expand: true,
            src: 'build/client/exercises/+([0-9])-+([a-z-]).js',
            ext: '.min.js',
          },
        ],
      },
      app: {
        src: 'build/client/app.js',
        dest: 'build/client/app.min.js',
      },
    },
    uglify: (function() {
      const taskConfig = {
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
      };
      for (const key in config.distributions) {
        taskConfig[key] = {
          options: {beautify: config.distributions[key].beautify},
          src: 'build/client/app.min.js',
          dest: `dist/${key}/app.min.js`,
        };
      }
      return taskConfig;
    })(),
    replace: (function() {
      const taskConfig = {};
      const filenames = grunt.file.expand({cwd: 'src/client/exercises'}, [
        '+([0-9])-*.js',
      ]);
      for (const name of filenames) {
        const basename = path.basename(name, '.js');
        exerciseNames.push(basename);
        taskConfig[basename] = {
          options: {
            patterns: [{match: 'path', replacement: `${basename}.min.js`}],
          },
          src: 'src/client/exercises/template.html',
          dest: `dist/exercises/${basename}.html`,
        };
      }
      for (const key in config.distributions) {
        taskConfig[key] = {
          options: {
            patterns: [
              {
                match: 'api-endpoint',
                replacement: config.distributions[key].apiEndpoint,
              },
            ],
          },
          src: 'src/client/index.template.html',
          dest: `dist/${key}/index.html`,
        };
      }
      return taskConfig;
    })(),
    less: (function() {
      const taskConfig = {
        exercises: {
          src: ['src/client/exercises/style.less'],
          dest: 'dist/exercises/style.css',
        },
      };
      for (const key in config.distributions) {
        taskConfig[key] = {
          src: ['src/client/style.less'],
          dest: `dist/${key}/style.css`,
        };
      }
      return taskConfig;
    })(),
    watch: {
      exercises: {
        files: 'src/exercises/**',
        tasks: 'build-exercises',
        options: {livereload: true},
      },
      local: {
        files: 'src/**',
        tasks: 'build-local',
        options: {livereload: true},
      },
    },
    rsync: {
      exercises: {
        options: {
          src: 'dist/exercises/',
          dest: '/usr/share/wordpress/phantasml/exercises',
          host: 'www.fungibleinsight.com',
          delete: true,
          recursive: true,
        },
      },
    },
    s3: (function() {
      const taskConfig = {options: config.awsCredentials};
      for (const key in config.distributions) {
        const bucket = config.distributions[key].bucket;
        if (bucket) {
          taskConfig[key] = {
            options: {bucket},
            cwd: `dist/${key}`,
            src: ['index.html', 'app.min.js', 'style.css'],
          };
        }
      }
      return taskConfig;
    })(),
  });

  // distribution tasks
  for (const key in config.distributions) {
    grunt.registerTask(`build-${key}`, `Builds the ${key} distribution.`, [
      'babel',
      'browserify:app',
      `uglify:${key}`,
      `replace:${key}`,
      `less:${key}`,
    ]);
    if (config.distributions[key].bucket) {
      grunt.registerTask(
        `publish-${key}`,
        `Publishes the ${key} distribution.`,
        [`build-${key}`, `s3:${key}`],
      );
    }
  }

  // exercises tasks
  grunt.registerTask('build-exercises', 'Builds the exercises.', [
    'babel',
    'browserify:exercises',
    'uglify:exercises',
    ...exerciseNames.map(name => `replace:${name}`),
    'less:exercises',
  ]);
  grunt.registerTask('publish-exercises', 'Publishes the exercises.', [
    'build-exercises',
    'rsync:exercises',
  ]);

  // Default task(s).
  grunt.registerTask('default', ['build-local']);
};
