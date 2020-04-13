const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const moment = require('moment');
const chalk = require('chalk');
const core = require('@actions/core');
const COS = require('cos-nodejs-sdk-v5');

let secretId = core.getInput('secretId');
let secretKey = core.getInput('secretKey');
let envId = core.getInput('envId');
let staticSrcPath = core.getInput('staticSrcPath');
let staticDestPath = core.getInput('staticDestPath');
let bucket = core.getInput('bucket');
let region = core.getInput('region');
let isForce = core.getInput('isForce') || false;

if (!process.env.CI) {
  const config = require('./config/index');
  secretId = config.secretId;
  secretKey = config.secretKey;
  envId = config.envId;
  staticSrcPath = config.staticSrcPath;
  staticDestPath = config.staticDestPath;
  bucket = config.bucket
  region = config.region;
  isForce = config.isForce;
}

const assetJsonFile = path.join(__dirname, './docschina-assets.json')

const cos = new COS({
    SecretId: secretId,
    SecretKey: secretKey,
});

const getObject = async () => {
    return new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: bucket, /* 必须 */
            Region: region,    /* 必须 */
            Key: 'docschina-assets.json',              /* 必须 */
            Output: fs.createWriteStream(assetJsonFile),
        }, function(err, data) {
            // console.log(err || data);
            if (err) {
                fs.unlinkSync(assetJsonFile)
                resolve(err);
            }
            else {
                resolve(data);
            }
        });
    })
}

/**
 * 忽略部份文件的部署
 * @param {Object} projectData
 * @param {Array} filesParam
 */
const skipFiles = function(projectData = {}, filesParam) {
    let skip = projectData.skip || [];

    if (!Array.isArray(skip)) {
        return filesParam;
    }

    let files = filesParam.filter((item) => {
        for (let i = 0, len = skip.length; i < len; i++) {
        if (item.indexOf(skip[i]) === 0) {
            return false;
        }
        }

        return true;
    });

    return files;
}
/**
 * 将 html 文件放到最末尾上传
 * @param {Array} files 
 */
const pushHtmlFiles = function(files) {
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
const sliceUploadFile = function(cos, options) {
    return new Promise((resolve, reject) => {
        cos.sliceUploadFile(options, (err, info) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(info);
            }
        });
    });
};


const init = async () => {
    try {
        let result = await getObject();
        let assetJsonMap = {
            map: []
        };

        // 获取 map 数据
        if (result.statusCode === 200 && !isForce) {
            assetJsonMap.map = require(assetJsonFile).map;
        }

        let codePath = path.join(__dirname, staticSrcPath);
        core.debug(`codePath: ${codePath}`);
        //收集需要上传的文件，传入数组
        let globResult = await new Promise((resolve, reject) => {
            glob('**/*', { cwd: codePath }, function (err, files) {
                if (err) {
                    log.error(err);
                    reject(err);
                    return;
                }

                resolve(files);
            });
        });
        core.debug(`globResult: ${globResult}`);

        // 忽略某些文件
        // globResult = skipFiles({}, globResult);

        // 剔除文件
        let files = globResult.filter((file) => {
            // 剔走已经上传的内容
            if (assetJsonMap.map.includes(file)) {
                return false;
            }

            let filePath = path.join(codePath, file);

            // 剔走目录
            let stat = fs.statSync(filePath);
            return !stat.isDirectory();
        });

        // 将 html 文件放到最后再上传
        files = pushHtmlFiles(files);

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
        try {
            let info = await Promise.all(uploadActions);
            
            info.forEach((item) => {
                logTimeResult(`${item.Location}-${item.statusCode}`);
                        
                let splitResult = item.Location.split('/');
                assetJsonMap.map.push(splitResult.splice(1, splitResult.length - 1).join('/'))
            });     
            
            core.setOutput('deployResult', JSON.stringify(assetJsonMap.map));
        }
        catch (e) {
            core.error(e.message);
            core.setOutput('deployResult', e.message)
            logTimeResult(`${e.Key}-${e.statusCode}-${e.Code}`, 'error');
        }

        fs.writeFileSync(assetJsonFile, JSON.stringify(assetJsonMap, 4, null));

        await sliceUploadFile(cos, {
            Bucket: bucket,
            Region: region,
            Key: 'docschina-assets.json',
            FilePath: assetJsonFile,
        })

        if (fs.existsSync(assetJsonFile)) {
            fs.unlinkSync(assetJsonFile);
        }
    }
    catch (e) {
      core.error(e.message);
      core.setOutput('deployResult', e.message)
    }
}

init().then((res) => {

})