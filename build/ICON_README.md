# 应用图标说明

由于技术限制，无法直接生成 .ico 格式的图标文件。您需要：

## 方式一：在线转换工具

1. 访问 https://www.icoconverter.com/ 或类似网站
2. 上传一个 PNG 或 JPG 图片（建议 256x256 像素）
3. 转换为 .ico 格式
4. 将生成的 icon.ico 文件放到 `build/` 目录下

## 方式二：使用工具

如果安装了 ImageMagick：

```bash
convert your-image.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

## 临时方案

如果暂时没有图标，可以：
1. 使用 Electron 默认图标
2. 或者注释掉 `electron/main/index.ts` 中的 `icon` 配置

修改 `electron/main/index.ts`：

```typescript
function createWindow() {
  mainWindow = new BrowserWindow({
    // ... 其他配置
    // icon: path.join(__dirname, '../../build/icon.ico'), // 临时注释掉
  });
  // ...
}
```

## 推荐图标设计

- **尺寸**: 256x256 像素
- **格式**: PNG 或 JPG
- **内容**: 简单、清晰的图标
- **配色**: 符合你的应用主题
