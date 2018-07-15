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
    copy: {
      app: {
        files: [
          {
            expand: true,
            cwd: 'src/server',
            src: ['template.yaml', 'package.json'],
            dest: 'build/server/',
          },
        ],
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
        const distributionConfig = config.distributions[key];
        taskConfig[key] = {
          options: {
            patterns: [
              {
                match: 'api-endpoint',
                replacement: distributionConfig.apiEndpoint,
              },
              {
                match: 'live-reload-tag',
                replacement: distributionConfig.liveReload
                  ? '<script src="http://localhost:35729/livereload.js"></script>'
                  : '',
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
    exec: (function() {
      const taskConfig = {
        localApi: {
          cmd: 'sam local start-api --skip-pull-image -s ../../dist/local',
          cwd: 'build/server',
        },
      };
      for (const key in config.distributions) {
        const bucket = config.distributions[key].bucket;
        if (bucket) {
          taskConfig[`package-${key}`] = {
            cmd:
              'sam package --template-file template.yaml ' +
              `--output-template-file ${key}.yaml --s3-bucket ${bucket}`,
            cwd: 'build/server',
          };
          taskConfig[`deploy-${key}`] = {
            cmd:
              `sam deploy --template-file ${key}.yaml ` +
              `--stack-name ${bucket} --s3-bucket ${bucket} ` +
              `--capabilities CAPABILITY_IAM`,
            cwd: 'build/server',
          };
        }
      }
      return taskConfig;
    })(),
    open: {
      local: {
        path: 'http://localhost:3000/index.html',
        delay: 2.0,
      },
    },
    concurrent: {
      options: {logConcurrentOutput: true},
      local: ['watch:local', 'exec:localApi', 'open:local'],
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
      'copy:app',
      `uglify:${key}`,
      `replace:${key}`,
      `less:${key}`,
    ]);
    if (config.distributions[key].bucket) {
      grunt.registerTask(
        `publish-${key}`,
        `Publishes the ${key} distribution.`,
        [
          `build-${key}`,
          `s3:${key}`,
          `exec:package-${key}`,
          `exec:deploy-${key}`,
        ],
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

  // builds local distribution and watches for changes
  grunt.registerTask(
    'start-local',
    'Builds the local distribution, starts it, and watches for changes.',
    ['build-local', 'concurrent:local'],
  );

  // Default task(s).
  grunt.registerTask('default', ['start-local']);
};
