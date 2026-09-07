/**
 * pptx-template.ts — PPTX 模板复用三命令
 *
 * clone    <target> <template>  复制模板文件并清空 slides，保留主题/版式/母版/媒体
 * layouts  <file>               列出所有版式：名称、类型、背景、占位符
 * newslide <file> --layout N    按指定版式新增 slide，复制版式占位符并填入文本
 *
 * 设计要点：样式（字体/配色/背景图/版式）全部通过「复用模板文件本身」继承，
 * AI 只负责选择版式和填充文字，文字的字体字号由占位符 → 版式 → 母版 → 主题
 * 逐级继承，无需在 slide 层写任何 rPr。
 */

import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import type { CLIOptions, CommandResult, OOXMLDocument } from '../types';
import { openDocument, saveDocument, readPart, writePart, listParts, closeDocument, removePart } from '../core/ooxml';
import { parseXml, serializeXml, childrenOf, appendChild, insertAfter, el, txt } from '../core/xml-tree';
import type { XmlTree, XmlNode } from '../core/xml-tree';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SLIDE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const NOTES_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const LAYOUT_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';

// ── clone ──────────────────────────────────────────────────────

/**
 * 复制 template → target，然后清空所有 slides（及备注页），
 * 保留 theme / slideMasters / slideLayouts / media，得到一个"空壳模板"。
 */
export async function cmdClone(targetPath: string, args: string[], _options: CLIOptions): Promise<CommandResult> {
  if (args.length < 1) {
    return { success: false, error: 'Usage: clone <target_file> <template_file>' };
  }
  const templatePath = args[0];

  try {
    const absTemplate = path.resolve(templatePath);
    const absTarget = path.resolve(targetPath);

    if (!fs.existsSync(absTemplate)) {
      return { success: false, error: `Template file not found: ${absTemplate}` };
    }
    if (path.extname(absTemplate).toLowerCase() !== '.pptx' || path.extname(absTarget).toLowerCase() !== '.pptx') {
      return { success: false, error: 'clone only supports .pptx files' };
    }
    if (fs.existsSync(absTarget)) {
      return { success: false, error: `Target already exists: ${absTarget} (clone refuses to overwrite)` };
    }

    // 1. 整文件复制（字节级保留 theme/masters/layouts/media）
    fs.copyFileSync(absTemplate, absTarget);

    // 2. 打开副本并清空 slides
    let doc: OOXMLDocument | null = null;
    try {
      doc = await openDocument(absTarget);
      const removed = clearAllSlides(doc);
      await saveDocument(doc);

      const remainingLayouts = listParts(doc).filter(p => /ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p)).length;
      const mediaCount = listParts(doc).filter(p => p.startsWith('ppt/media/')).length;

      return {
        success: true,
        message: `Cloned template ${absTemplate} → ${absTarget} (removed ${removed.slides} slides, ${removed.notesSlides} notes slides)`,
        data: {
          target: absTarget,
          template: absTemplate,
          removedSlides: removed.slides,
          removedNotesSlides: removed.notesSlides,
          keptLayouts: remainingLayouts,
          keptMediaFiles: mediaCount,
        },
      };
    } finally {
      if (doc) closeDocument(doc);
    }
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  }
}

/**
 * 清空文档中的所有 slide / notesSlide parts 及其引用。
 * 保留：presentation.xml（含 sldSz）、theme、masters、layouts、media、notesMaster。
 */
function clearAllSlides(doc: OOXMLDocument): { slides: number; notesSlides: number } {
  const parts = listParts(doc);
  const slideParts = parts.filter(p => /^ppt\/slides\/(slide\d+\.xml|_rels\/slide\d+\.xml\.rels)$/.test(p));
  const notesParts = parts.filter(p => /^ppt\/notesSlides\/(notesSlide\d+\.xml|_rels\/notesSlide\d+\.xml\.rels)$/.test(p));

  for (const p of [...slideParts, ...notesParts]) {
    removePart(doc, p);
  }

  // [Content_Types].xml：移除 slide / notesSlide 的 Override 声明（解析 XML 而非正则，避免属性顺序/引号差异漏删）
  const ctTree = parseXml(readPart(doc, '[Content_Types].xml'));
  const ctRoot = ctTree.nodes.find(n => n.type === 'element')!;
  ctRoot.children = (ctRoot.children ?? []).filter((c): c is XmlNode =>
    !(c.type === 'element' && c.tag === 'Override' &&
      /^\/ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(c.attrs?.['PartName'] ?? ''))
  );
  writePart(doc, '[Content_Types].xml', serializeXml(ctTree));

  // presentation.xml：清空 sldIdLst（保留空列表节点，合法）
  const presTree = parseXml(readPart(doc, 'ppt/presentation.xml'));
  const pres = presTree.nodes.find(n => n.type === 'element')!;
  const sldIdLst = childrenOf(pres, 'p:sldIdLst')[0];
  if (sldIdLst) {
    sldIdLst.children = [];
  }
  writePart(doc, 'ppt/presentation.xml', serializeXml(presTree));

  // presentation.xml.rels：移除 slide / notesSlide 关系
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const relsTree = parseXml(readPart(doc, relsPath));
  const relsRoot = relsTree.nodes.find(n => n.type === 'element')!;
  const toRemove = relsRoot.children?.filter((c): c is XmlNode =>
    c.type === 'element' && c.tag === 'Relationship' &&
    (c.attrs?.['Type'] === SLIDE_REL_TYPE || c.attrs?.['Type'] === NOTES_REL_TYPE)
  ) ?? [];
  relsRoot.children = relsRoot.children?.filter(c => !toRemove.includes(c as XmlNode)) ?? [];
  writePart(doc, relsPath, serializeXml(relsTree));

  return {
    slides: slideParts.filter(p => p.endsWith('.xml') && !p.includes('_rels')).length,
    notesSlides: notesParts.filter(p => p.endsWith('.xml') && !p.includes('_rels')).length,
  };
}

// ── layouts ────────────────────────────────────────────────────

/**
 * 列出所有版式及占位符信息，附带主题字体与幻灯片尺寸，
 * 供 AI 决定每页内容使用哪个版式。
 */
export async function cmdLayouts(filePath: string, _args: string[], _options: CLIOptions): Promise<CommandResult> {
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    if (doc.docType !== 'pptx') {
      return { success: false, error: `layouts only supports .pptx (got .${doc.docType})` };
    }

    const layoutParts = listParts(doc)
      .filter(p => /ppt\/slideLayouts\/slideLayout(\d+)\.xml$/.test(p))
      .sort((a, b) => {
        const na = parseInt(a.match(/slideLayout(\d+)\.xml$/)![1], 10);
        const nb = parseInt(b.match(/slideLayout(\d+)\.xml$/)![1], 10);
        return na - nb;
      });

    const layouts = layoutParts.map(p => {
      const num = parseInt(p.match(/slideLayout(\d+)\.xml$/)![1], 10);
      return describeLayout(doc!, num);
    });

    return {
      success: true,
      data: {
        slideSize: getSlideSize(doc),
        themeFonts: getThemeFonts(doc),
        layoutCount: layouts.length,
        layouts,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

function describeLayout(doc: OOXMLDocument, num: number): Record<string, unknown> {
  const partPath = `ppt/slideLayouts/slideLayout${num}.xml`;
  const placeholders: { type: string; idx: string; sampleText: string }[] = [];
  let name = '';
  let layoutType = '';
  let background = 'none (inherits from master)';
  let pictureCount = 0;

  try {
    const tree = parseXml(readPart(doc, partPath));
    const root = tree.nodes.find(n => n.type === 'element')!;
    layoutType = root.attrs?.['type'] ?? 'custom';

    const cSld = childrenOf(root, 'p:cSld')[0];
    if (cSld?.attrs?.['name']) name = cSld.attrs['name'];

    const spTree = childrenOf(cSld, 'p:spTree')[0];

    // 背景
    const bg = cSld ? childrenOf(cSld, 'p:bg')[0] : null;
    if (bg) {
      const bgPr = childrenOf(bg, 'p:bgPr')[0];
      if (bgPr) {
        if (childrenOf(bgPr, 'a:blipFill').length) background = 'image';
        else if (childrenOf(bgPr, 'a:solidFill').length) {
          const srgb = childrenOf(childrenOf(bgPr, 'a:solidFill')[0], 'a:srgbClr')[0];
          background = srgb?.attrs?.['val'] ? `solid #${srgb.attrs['val']}` : 'solid (theme color)';
        } else if (childrenOf(bgPr, 'a:gradFill').length) background = 'gradient';
        else background = 'other';
      } else if (childrenOf(bg, 'p:bgRef').length) {
        background = 'from master (bgRef)';
      }
    }

    // 占位符与装饰图片
    for (const sp of childrenOf(spTree, 'p:sp')) {
      const ph = findPlaceholder(sp);
      if (ph) {
        placeholders.push({
          type: ph.attrs?.['type'] ?? 'body',
          idx: ph.attrs?.['idx'] ?? '',
          sampleText: layoutShapeText(sp).substring(0, 100),
        });
      }
    }
    pictureCount = childrenOf(spTree, 'p:pic').length;
  } catch {
    // 解析失败时仍保留条目，标记为 unreadable
  }

  return {
    layout: num,
    part: partPath,
    name,
    type: layoutType,
    background,
    decorativePictures: pictureCount,
    placeholders,
  };
}

function findPlaceholder(sp: XmlNode): XmlNode | null {
  const nvSpPr = childrenOf(sp, 'p:nvSpPr')[0];
  if (!nvSpPr) return null;
  const nvPr = childrenOf(nvSpPr, 'p:nvPr')[0];
  if (!nvPr) return null;
  return childrenOf(nvPr, 'p:ph')[0] ?? null;
}

function layoutShapeText(sp: XmlNode): string {
  const txBody = childrenOf(sp, 'p:txBody')[0];
  if (!txBody) return '';
  let result = '';
  for (const p of childrenOf(txBody, 'a:p')) {
    for (const r of childrenOf(p, 'a:r')) {
      for (const t of childrenOf(r, 'a:t')) {
        result += textContent(t);
      }
    }
    result += '\n';
  }
  return result.trim();
}

function textContent(node: XmlNode): string {
  return (node.children ?? []).map(c => c.type === 'text' ? (c.text ?? '') : '').join('');
}

function getSlideSize(doc: OOXMLDocument): Record<string, string> {
  try {
    const tree = parseXml(readPart(doc, 'ppt/presentation.xml'));
    const pres = tree.nodes.find(n => n.type === 'element')!;
    const sz = childrenOf(pres, 'p:sldSz')[0];
    if (sz?.attrs) {
      const cx = parseInt(sz.attrs['cx'] ?? '0', 10);
      const cy = parseInt(sz.attrs['cy'] ?? '0', 10);
      return {
        widthEmu: sz.attrs['cx'] ?? '',
        heightEmu: sz.attrs['cy'] ?? '',
        widthCm: (cx / 360000).toFixed(1),
        heightCm: (cy / 360000).toFixed(1),
      };
    }
  } catch { /* ignore */ }
  return {};
}

function getThemeFonts(doc: OOXMLDocument): Record<string, string> {
  try {
    const xml = readPart(doc, 'ppt/theme/theme1.xml');
    const fonts: Record<string, string> = {};
    for (const scheme of ['majorFont', 'minorFont']) {
      const m = xml.match(new RegExp(`<a:${scheme}>[\\s\\S]*?</a:${scheme}>`));
      if (!m) continue;
      const latin = m[0].match(/<a:latin typeface="([^"]*)"/);
      const ea = m[0].match(/<a:ea typeface="([^"]*)"/);
      fonts[`${scheme === 'majorFont' ? 'major' : 'minor'}Latin`] = latin?.[1] ?? '';
      fonts[`${scheme === 'majorFont' ? 'major' : 'minor'}EastAsian`] = ea?.[1] ?? '';
    }
    return fonts;
  } catch {
    return {};
  }
}

// ── newslide ───────────────────────────────────────────────────

/**
 * 按版式新增一页 slide：
 *   1. 解析 slideLayoutN.xml，复制其中的占位符形状到新 slide
 *   2. 按占位符类型填充文本（title/ctrTitle←--title，subTitle←--subtitle，
 *      其余按 idx 顺序消费 --texts 数组；\n 分段）
 *   3. 新 slide 的 rels 指向该版式；更新 presentation.xml / rels / Content_Types
 */
export async function cmdNewSlide(filePath: string, _args: string[], options: CLIOptions): Promise<CommandResult> {
  const layoutNum = parseInt(options.layout ?? '', 10);
  if (!Number.isFinite(layoutNum) || layoutNum < 1) {
    return { success: false, error: 'Usage: newslide <file> --layout <n> [--title t] [--subtitle t] [--texts json-array]' };
  }

  let texts: string[] = [];
  if (options.texts) {
    try {
      const parsed = JSON.parse(options.texts);
      texts = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      return { success: false, error: `--texts must be a JSON array or a single string, got: ${options.texts}` };
    }
  }

  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    if (doc.docType !== 'pptx') {
      return { success: false, error: `newslide only supports .pptx (got .${doc.docType})` };
    }

    const layoutPart = `ppt/slideLayouts/slideLayout${layoutNum}.xml`;
    if (!listParts(doc).includes(layoutPart)) {
      return { success: false, error: `Layout ${layoutNum} not found (${layoutPart}). Use the layouts command to list available layouts.` };
    }

    // 新 slide 编号 = 现有最大编号 + 1（clone 后为 1）
    const parts = listParts(doc);
    let maxSlideNum = 0;
    for (const p of parts) {
      const m = p.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      if (m) maxSlideNum = Math.max(maxSlideNum, parseInt(m[1], 10));
    }
    const newSlideNum = maxSlideNum + 1;
    const slidePart = `ppt/slides/slide${newSlideNum}.xml`;
    const slideRelsPart = `ppt/slides/_rels/slide${newSlideNum}.xml.rels`;

    // 1. 从版式构建 slide 内容（复制占位符 + 填文本）
    const layoutTree = parseXml(readPart(doc, layoutPart));
    const layoutRoot = layoutTree.nodes.find(n => n.type === 'element')!;
    const layoutSpTree = childrenOf(childrenOf(layoutRoot, 'p:cSld')[0], 'p:spTree')[0];

    // title/subtitle 由占位符类型匹配，texts 按顺序喂给其余占位符
    const bodyTexts = texts;

    const zip = doc.zip as PizZip;
    let nextShapeId = 2;
    const shapeXmls: string[] = [];
    let bodyCursor = 0;
    let filled: { type: string; text: string }[] = [];

    // 页脚/页码/日期占位符由 PowerPoint 从版式自动继承，slide 层不复制，
    // 否则会错误消耗一个 --texts 文本（正文内容被塞进页脚）
    const HF_PLACEHOLDER_TYPES = new Set(['ftr', 'sldNum', 'dt']);

    for (const sp of childrenOf(layoutSpTree, 'p:sp')) {
      const ph = findPlaceholder(sp);
      if (!ph) continue; // 版式上的非占位符装饰形状不复制（留在版式层渲染）

      const phType = ph.attrs?.['type'] ?? 'body';
      if (HF_PLACEHOLDER_TYPES.has(phType)) continue;
      let text: string | null = null;
      if (phType === 'title' || phType === 'ctrTitle') {
        text = options.title ?? null;
      } else if (phType === 'subTitle') {
        text = options.subtitle ?? null;
      } else {
        text = bodyCursor < bodyTexts.length ? bodyTexts[bodyCursor] : null;
        bodyCursor++;
      }

      const cloned = cloneNode(sp);
      // 重新分配 shape id（slide 内唯一）
      const cNvPr = childrenOf(childrenOf(cloned, 'p:nvSpPr')[0], 'p:cNvPr')[0];
      if (cNvPr?.attrs) cNvPr.attrs['id'] = String(nextShapeId++);
      applyTextToPlaceholder(cloned, text);
      shapeXmls.push(serializeXml([cloned]));
      if (text !== null) filled.push({ type: phType, text });
    }

    zip.file(slidePart,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      shapeXmls.join('') +
      '</p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
      '</p:sld>');

    // 2. slide rels → 指向版式
    zip.file(slideRelsPart,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="${REL_NS}">` +
      `<Relationship Id="rId1" Type="${LAYOUT_REL_TYPE}" Target="../slideLayouts/slideLayout${layoutNum}.xml"/>` +
      '</Relationships>');

    // 3. presentation.xml.rels：新增 slide 关系（rId 取现有最大值 + 1）
    const relsPart = 'ppt/_rels/presentation.xml.rels';
    const relsTree = parseXml(readPart(doc, relsPart));
    const relsRoot = relsTree.nodes.find(n => n.type === 'element')!;
    let maxRid = 0;
    for (const rel of childrenOf(relsRoot, 'Relationship')) {
      const m = rel.attrs?.['Id']?.match(/^rId(\d+)$/);
      if (m) maxRid = Math.max(maxRid, parseInt(m[1], 10));
    }
    const newRid = `rId${maxRid + 1}`;
    appendChild(relsRoot, el('Relationship', {
      Id: newRid, Type: SLIDE_REL_TYPE, Target: `slides/slide${newSlideNum}.xml`,
    }));
    writePart(doc, relsPart, serializeXml(relsTree));

    // 4. presentation.xml：sldIdLst 追加新页
    const presTree = parseXml(readPart(doc, 'ppt/presentation.xml'));
    const pres = presTree.nodes.find(n => n.type === 'element')!;
    let sldIdLst = childrenOf(pres, 'p:sldIdLst')[0];
    if (!sldIdLst) {
      sldIdLst = el('p:sldIdLst');
      // CT_Presentation 子元素顺序：sldMasterIdLst → notesMasterIdLst → handoutMasterIdLst → sldIdLst → sldSz...
      // 插在三者中最后出现的之后；都不存在则插在 sldSz 之前（或末尾）
      const orderTags = ['p:sldMasterIdLst', 'p:notesMasterIdLst', 'p:handoutMasterIdLst'];
      let anchor: XmlNode | null = null;
      for (const tag of orderTags) {
        const node = childrenOf(pres, tag)[0];
        if (node) anchor = node;
      }
      if (anchor) {
        insertAfter(pres, anchor, sldIdLst);
      } else {
        const sldSz = childrenOf(pres, 'p:sldSz')[0];
        const insertAt = sldSz ? pres.children!.indexOf(sldSz) : pres.children!.length;
        pres.children!.splice(insertAt, 0, sldIdLst);
      }
    }
    let maxSldId = 255;
    for (const s of childrenOf(sldIdLst, 'p:sldId')) {
      maxSldId = Math.max(maxSldId, parseInt(s.attrs?.['id'] ?? '256', 10));
    }
    appendChild(sldIdLst, el('p:sldId', { id: String(maxSldId + 1), 'r:id': newRid }));
    writePart(doc, 'ppt/presentation.xml', serializeXml(presTree));

    // 5. [Content_Types].xml：声明新 slide part
    const ct = readPart(doc, '[Content_Types].xml');
    const override = `<Override PartName="/ppt/slides/slide${newSlideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    const insertPos = ct.indexOf('</Types>');
    if (insertPos < 0) return { success: false, error: 'Malformed [Content_Types].xml' };
    writePart(doc, '[Content_Types].xml', ct.substring(0, insertPos) + override + ct.substring(insertPos));

    await saveDocument(doc);

    return {
      success: true,
      message: `Added slide ${newSlideNum} using layout ${layoutNum}`,
      data: {
        slide: newSlideNum,
        layout: layoutNum,
        relationshipId: newRid,
        placeholdersFilled: filled,
        placeholdersEmpty: shapeXmls.length - filled.length,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

function cloneNode(node: XmlNode): XmlNode {
  return {
    type: node.type,
    tag: node.tag,
    attrs: node.attrs ? { ...node.attrs } : undefined,
    selfClosing: node.selfClosing,
    children: node.children?.map(cloneNode),
    text: node.text,
  };
}

/**
 * 将文本写入占位符的 txBody：保留 bodyPr / lstStyle（样式继承关键），
 * 替换全部 a:p。text 为 null 时写入空段落（保留占位符但无内容）。
 * 多行文本（\n）拆为多个段落。
 */
function applyTextToPlaceholder(sp: XmlNode, text: string | null): void {
  let txBody = childrenOf(sp, 'p:txBody')[0];
  if (!txBody) {
    txBody = el('p:txBody', {}, [el('a:bodyPr', {}), el('a:lstStyle', {})]);
    appendChild(sp, txBody);
  }

  const paragraphs: string[] = text === null ? [''] : text.split('\n');
  const newParas: XmlNode[] = paragraphs.map(line =>
    el('a:p', {}, line
      ? [el('a:r', {}, [el('a:rPr', { lang: 'zh-CN', dirty: '0' }), el('a:t', {}, [txt(escapeText(line))])])]
      : [el('a:endParaRPr', { lang: 'zh-CN', dirty: '0' })])
  );

  // 保留非 a:p 子节点（bodyPr / lstStyle），替换全部 a:p
  txBody.children = [
    ...(txBody.children ?? []).filter(c => !(c.type === 'element' && c.tag === 'a:p')),
    ...newParas,
  ];
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
