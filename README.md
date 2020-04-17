# 印记中文文档部署工具

- secretId
  必填
  腾讯云 secret ID

- secretKey
  必填
  腾讯云 secret Key

- bucket
  选填
  腾讯云 COS 桶.

- region
  选填
  腾讯云 COS 地域.

- staticSrcPath
  必填
  本地要上传的目录.

- staticDestPath
  选填
  远端的目录，默认为根目录.

- envId
  选填
  云开发环境 id，如果填该选项，则 bucket, region 参数不再有用，因为会默认使用云开发的静态站点部署服务进行部署.

- isForce
  选填
  是否强制全量更新，默认为 false，即增量更新.

- skipFiles
  选填
  要跳过不上传的文件，默认为[]，即无任何要跳过的文件或目录.
