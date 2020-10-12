# 印记中文文档部署工具

支持腾讯云 COS 以及腾讯云云开发(cloudbase)的部署。

## Secrets

- 上传到腾讯云云开发的时候，必填项为：envId, secretId, secretKey, staticSrcPath.
- 上传到腾讯云 COS 的的时候，必填项为：secretId, secretKey, bucket, region, staticSrcPath.

- secretId
  必填
  腾讯云 secret ID

- secretKey
  必填
  腾讯云 secret Key.

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

- forceFiles
  选填
  要强制上传的文件，默认为[]，即无任何要强制上传的文件或目录.

## 用法

```yaml
-steps:
  - name: Build and Grant Permission
        run: |
          npm i
          npm run build
          sudo -i
          sudo chown -R $USER build

  - name: Docschina Github Action
        id: docschinaDeploy
        uses: docschina/docschina-actions@1.0.0
        with:
          secretId: ${{ secrets.SECRET_ID }}
          secretKey: ${{ secrets.SECRET_KEY }}
          staticSrcPath: ./build
          bucket: ${{ secrets.BUCKET }}
          region: ${{ secrets.REGION }}
          isForce: ${{ secrets.ISFORCE }}
          envId: ${{ secrets.ENV_ID }}
          forceFiles: ${{ secrets.FORCE_FILES }}
  - name: Get Deployment Result
      run: echo "Deploy to docschina result ${{ steps.docschinaDeploy.outputs.deployResult }}"
```

如果想进入 `DEBUG` 模式，请配置 `Secrets` 的 `Key` 为 `ACTIONS_STEP_DEBUG，值为` true.
