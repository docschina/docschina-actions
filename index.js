const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const moment = require('moment');
const chalk = require('chalk');
const core = require('@actions/core');
const COS = require('cos-nodejs-sdk-v5');
const Client = require('@cloudbase/cli');

let secretId = core.getInput('secretId');
let secretKey = core.getInput('secretKey');
let envId = core.getInput('envId');
let staticSrcPath = core.getInput('staticSrcPath');
let staticDestPath = core.getInput('staticDestPath');
let bucket = core.getInput('bucket');
let region = core.getInput('region');
let isForce = core.getInput('isForce') || false;
let skipFiles = core.getInput('skipFiles') || [];
let assetFileName = core.getInput('assetFileName') || 'docschina-assets.json';
let workspace = process.env.GITHUB_WORKSPACE;

if (!process.env.CI) {
  const config = require('./config/index');
  secretId = config.secretId;
  secretKey = config.secretKey;
  envId = config.envId;
  staticSrcPath = config.staticSrcPath;
  staticDestPath = config.staticDestPath;
  bucket = config.bucket;
  region = config.region;
  isForce = config.isForce;
  skipFiles = config.skipFiles;
  workspace = __dirname;
}

const assetJsonFile = path.join(workspace, assetFileName);

const cos = new COS({
  SecretId: secretId,
  SecretKey: secretKey,
});

const getObject = async () => {
  return new Promise((resolve, reject) => {
    cos.getObject(
      {
        Bucket: bucket /* 必须 */,
        Region: region /* 必须 */,
        Key: assetFileName /* 必须 */,
        Output: fs.createWriteStream(assetJsonFile),
      },
      function (err, data) {
        // console.log(err || data);
        if (err) {
          fs.unlinkSync(assetJsonFile);
          resolve(err);
        } else {
          resolve(data);
        }
      }
    );
  });
};

/**
 * 将 html 文件放到最末尾上传
 * @param {Array} files
 */
const appendHtmlFiles = function (files) {
  let htmlFiles = [];
  let cdnFiles = [];
  files.forEach((item) => {
    if (path.extname(item) === '.html') {
      htmlFiles.push(item);
    } else {
      cdnFiles.push(item);
    }
  });

  cdnFiles = cdnFiles.concat(htmlFiles);

  return cdnFiles;
};

/**
 * 输出日志
 * @param {*} result
 * @param {*} action
 */
const logTimeResult = function (result, action = null) {
  let msg = `[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${result}`;
  let color = null;

  let map = {
    error: 'red',
    info: 'cyan',
    success: 'green',
    warn: 'yellow',
  };

  if (action) {
    color = map[action] || null;
  }

  if (!color) {
    core.debug(msg);
  } else {
    core.debug(chalk[color](msg));
  }
};

/**
 * 上传文件
 * @param {*} cos
 * @param {*} options
 */
const sliceUploadFile = function (cos, options) {
  return new Promise((resolve, reject) => {
    cos.sliceUploadFile(options, (err, info) => {
      if (err) {
        resolve({
          code: 1,
          data: err,
        });
      } else {
        resolve({
          code: 0,
          data: info,
        });
      }
    });
  });
};

const initCos = async () => {
  try {
    let result = await getObject();
    let assetJsonMap = {
      map: [],
    };

    // 获取 map 数据
    if (result.statusCode === 200 && !isForce) {
      assetJsonMap.map = require(assetJsonFile).map;
    }

    if (typeof skipFiles === 'string') {
      skipFiles = JSON.parse(skipFiles);
    }

    let codePath = path.join(workspace, staticSrcPath);
    core.debug(`codePath: ${codePath}`);

    //收集需要上传的文件，传入数组
    let scanFiles = glob.sync('**/**', { cwd: codePath });

    core.debug(`scanFiles for ${codePath}: ${scanFiles}`);

    // 剔除文件
    let filterFiles = scanFiles.filter((file) => {
      // 剔走已经上传的内容
      if (assetJsonMap.map.includes(file)) {
        return false;
      }

      // 手动设置跳过的文件
      if (skipFiles.includes(file)) {
        return false;
      }

      let filePath = path.join(codePath, file);

      // 剔走目录
      let stat = fs.statSync(filePath);
      return !stat.isDirectory();
    });

    // 将 html 文件放到最后再上传
    let files = appendHtmlFiles(filterFiles);

    let uploadActions = [];
    files.forEach((file) => {
      let filePath = path.join(codePath, file);
      let key = staticDestPath ? path.join(staticDestPath, file) : file;

      let uploadOption = {
        Bucket: bucket,
        Region: region,
        Key: key,
        FilePath: filePath,
      };

      uploadActions.push(sliceUploadFile(cos, uploadOption));
    });

    // 开始上传文件
    let incrementalFiles = [];

    try {
      let info = await Promise.all(uploadActions);

      info.forEach((result) => {
        if (!result.code) {
          let item = result.data;
          logTimeResult(`${item.Location}-${item.statusCode}`);

          let splitResult = item.Location.split('/');
          let file = splitResult.splice(1, splitResult.length - 1).join('/');

          if (path.extname(file) !== '.html') {
            assetJsonMap.map.push(file);
          }
          incrementalFiles.push(file);
        } else {
          core.debug(result.data);
        }
      });

      core.setOutput(
        'deployResult',
        'success: ' + JSON.stringify(incrementalFiles)
      );
    } catch (e) {
      logTimeResult(`${e.Key}-${e.statusCode}-${e.Code}`, 'error');
      core.error(e.message);
      core.setFailed(e.message);
    }

    fs.writeFileSync(assetJsonFile, JSON.stringify(assetJsonMap, 4, null));

    await sliceUploadFile(cos, {
      Bucket: bucket,
      Region: region,
      Key: assetFileName,
      FilePath: assetJsonFile,
    });

    if (fs.existsSync(assetJsonFile)) {
      fs.unlinkSync(assetJsonFile);
    }
  } catch (e) {
    core.error(e.message);
    core.setFailed(e.message);
  }
};

/**
 *
 * initCloudBase
 *
 */

const storageService = null;

async function getMangerServiceInstance() {
  if (!storageService) {
    const { getMangerService } = require('@cloudbase/cli/lib/utils');
    const { storage } = await getMangerService(envId);
    return storage;
  }
  return storageService;
}

async function deployHostingFile(srcPath, cloudPath, envId) {
  const hosting = require('@cloudbase/cli/lib/commands/hosting/hosting');

  return hosting.deploy(
    {
      envId,
    },
    srcPath,
    cloudPath
  );
}

async function downloadStorageFile(localPath, cloudPath) {
  let storage = await getMangerServiceInstance();
  return storage.downloadFile({
    cloudPath,
    localPath,
  });
}

async function uploadStorageFile(localPath, cloudPath) {
  let storage = await getMangerServiceInstance();
  return storage.uploadFile({
    localPath,
    cloudPath,
    function() {
      console, log(1);
    },
  });
}

const initCloudBase = async () => {
  new Client(secretId, secretKey);

  let assetJsonMap = {
    map: [],
  };

  try {
    await downloadStorageFile(assetJsonFile, assetFileName);
  } catch (e) {
    core.error(e.message);
  }

  // 获取 map 数据
  if (fs.existsSync(assetJsonFile) && !isForce) {
    assetJsonMap.map = require(assetJsonFile).map;
  }

  if (typeof skipFiles === 'string') {
    skipFiles = JSON.parse(skipFiles);
  }
  core.debug(`skipFiles: ${skipFiles}`);

  let codePath = path.join(workspace, staticSrcPath);
  core.debug(`codePath: ${codePath}`);

  //收集需要上传的文件，传入数组
  let scanFiles = glob.sync('**/**', { cwd: codePath });

  core.debug(`scanFiles for ${codePath}: ${scanFiles}`);

  // 剔除文件
  let filterFiles = scanFiles.filter((file) => {
    // 剔走已经上传的内容
    if (assetJsonMap.map.includes(file)) {
      return false;
    }

    // 手动设置跳过的文件
    // if (skipFiles.includes(file)) {
    //   return false;
    // }
    for (let i = 0, len = skipFiles.length; i < len; i++) {
      if (file.indexOf(skipFiles[i]) === 0) {
        return false;
      }
    }

    let filePath = path.join(codePath, file);

    // 剔走目录
    let stat = fs.statSync(filePath);
    return !stat.isDirectory();
  });
  

  // 将 html 文件放到最后再上传
  let files = appendHtmlFiles(filterFiles);

  let uploadActions = [];
  files.forEach((file) => {
    let filePath = path.join(codePath, file);
    let key = staticDestPath ? path.join(staticDestPath, file) : file;

    uploadActions.push(
      deployHostingFile(filePath, key, envId)
      //   hosting.deploy(
      //     {
      //       envId,
      //     },
      //     filePath,
      //     key
      //   )
      //   hostingDeploy({
      //     filePath,
      //     cloudPath: key,
      //     envId,
      //   })
    );
  });

  // 开始上传文件
  let incrementalFiles = [];

  try {
    await Promise.all(uploadActions);
    files.forEach((file) => {
      if (path.extname(file) !== '.html') {
        assetJsonMap.map.push(file);
      }
      incrementalFiles.push(file);
    });

    core.setOutput('deployResult', JSON.stringify(incrementalFiles));
  } catch (e) {
    core.error(e.message);
    logTimeResult(`${e.Key}-${e.statusCode}-${e.Code}`, 'error');
    core.setFailed(e.message);
  }

  fs.writeFileSync(assetJsonFile, JSON.stringify(assetJsonMap, 4, null));

  await uploadStorageFile(assetJsonFile, assetFileName);

  if (fs.existsSync(assetJsonFile)) {
    fs.unlinkSync(assetJsonFile);
  }
};

// 上传到云开发服务
if (envId) {
  initCloudBase().then(() => {});
}
// 上传到腾讯云服务
else {
  initCos().then(() => {});
}
