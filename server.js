const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const APP_ROOT = path.join(__dirname, 'WebRoot');
const VIEW_ROOT = path.join(APP_ROOT, 'WEB-INF', 'views');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 禁用静态资源缓存，确保刷新页面能看到最新改动
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const DEFAULT_STORE = {
  gc_schedule_person: [],
  gc_common_dict: [
    { domainName: '性别', dictCode: '1', dictName: '男' },
    { domainName: '性别', dictCode: '2', dictName: '女' }
  ],
  gc_schedule_plan: [],
  gc_schedule_planorder: [],
  gc_schedule_group_person_v: [],
  gc_schedule_scheduler: [],
  gc_schedule_group: [],
  gc_schedule_check_statistics_v: []
};

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!fsSync.existsSync(STORE_FILE)) {
    await saveStore(DEFAULT_STORE);
  }
}

async function loadStore() {
  try {
    await ensureStoreFile();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load store file:', err);
    await saveStore(DEFAULT_STORE);
    return JSON.parse(JSON.stringify(DEFAULT_STORE));
  }
}

async function saveStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (err) {
    return [];
  }
}

function getCollection(store, collectionName) {
  store[collectionName] = store[collectionName] || [];
  return store[collectionName];
}

function getNextId(items, idField) {
  return items.reduce((max, item) => Math.max(max, Number(item[idField] || 0)), 0) + 1;
}

function projectFields(items, selectFields) {
  if (!selectFields || selectFields.trim() === '*' || selectFields.trim() === '') {
    return items;
  }
  const fields = selectFields.split(',').map((field) => field.trim());
  return items.map((item) => {
    const projected = {};
    fields.forEach((field) => {
      if (field in item) {
        projected[field] = item[field];
      }
    });
    return projected;
  });
}

function makePredicate(whereString) {
  const normalized = (whereString || '1=1').trim();
  if (/^1\s*=\s*1$/i.test(normalized)) {
    return () => true;
  }
  const parts = normalized.split(/\s+and\s+/i);
  return (item) => parts.every((part) => {
    const eqString = part.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*'([^']*)'\s*$/);
    if (eqString) {
      return String(item[eqString[1]] || '') === eqString[2];
    }
    const eqNumber = part.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*([0-9]+)\s*$/);
    if (eqNumber) {
      return String(item[eqNumber[1]] || '') === eqNumber[2];
    }
    return false;
  });
}

function applyWhere(items, whereString) {
  const predicate = makePredicate(whereString);
  return items.filter(predicate);
}

function parseSetFields(setFields) {
  if (!setFields) return {};
  let raw = setFields.trim();
  if (/^set\s+/i.test(raw)) {
    raw = raw.replace(/^set\s+/i, '');
  }
  const data = {};
  const regex = /([a-zA-Z0-9_]+)\s*=\s*'([^']*)'|([a-zA-Z0-9_]+)\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    if (match[1]) {
      data[match[1]] = match[2];
    } else if (match[3]) {
      data[match[3]] = Number(match[4]);
    }
  }
  return data;
}

async function saveEntities(table, items, idField) {
  if (!items || !items.length) return false;
  const store = await loadStore();
  const collection = getCollection(store, table);
  for (const item of items) {
    const newItem = { ...item };
    if (newItem[idField] == null) {
      newItem[idField] = getNextId(collection, idField);
    }
    collection.push(newItem);
  }
  await saveStore(store);
  return true;
}

async function updateEntities(table, items, idField) {
  if (!items || !items.length) return false;
  const store = await loadStore();
  const collection = getCollection(store, table);
  let updated = false;
  for (const item of items) {
    if (item[idField] == null) continue;
    const index = collection.findIndex((row) => String(row[idField]) === String(item[idField]));
    if (index !== -1) {
      collection[index] = { ...collection[index], ...item };
      updated = true;
    }
  }
  if (updated) {
    await saveStore(store);
  }
  return updated;
}

async function deleteById(table, idField, id) {
  const store = await loadStore();
  const collection = getCollection(store, table);
  const originalLength = collection.length;
  store[table] = collection.filter((item) => String(item[idField]) !== String(id));
  const changed = store[table].length < originalLength;
  if (changed) {
    await saveStore(store);
  }
  return changed;
}

async function clearCollection(table) {
  const store = await loadStore();
  store[table] = [];
  await saveStore(store);
  return true;
}

async function queryEntities(table, whereString, orderString, selectFields) {
  const store = await loadStore();
  let collection = getCollection(store, table);
  collection = applyWhere(collection, whereString);

  if (orderString && orderString.trim() !== '') {
    const orderParts = orderString.trim().split(/\s+/);
    const field = orderParts[0];
    const direction = (orderParts[1] || 'asc').toLowerCase();
    collection = [...collection].sort((a, b) => {
      const aValue = String(a[field] == null ? '' : a[field]);
      const bValue = String(b[field] == null ? '' : b[field]);
      return aValue.localeCompare(bValue, undefined, { numeric: true });
    });
    if (direction === 'desc') {
      collection.reverse();
    }
  }

  return projectFields(collection, selectFields);
}

function sanitizeTemplatePath(templatePath) {
  if (!templatePath) return null;
  const normalized = templatePath.replace(/^\/*/, '');
  if (normalized.includes('..')) {
    throw new Error('Invalid template path');
  }
  return path.join(APP_ROOT, normalized);
}

function parseTagAttributes(attrString) {
  const attrs = {};
  const regex = /([a-zA-Z0-9_]+)\s*=\s*"((?:\\.|[^"\\])*)"|([a-zA-Z0-9_]+)\s*=\s*'((?:\\.|[^'\\])*)'/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    if (match[1]) {
      attrs[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (match[3]) {
      attrs[match[3]] = match[4].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
  }
  return attrs;
}

async function resolveIncludes(content, currentDir, macros = {}) {
  const includeRegex = /<#include\s+["']([^"']+)["']\s*\/?\>/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    const includePath = match[1];
    const filePath = includePath.startsWith('/')
      ? path.join(VIEW_ROOT, includePath.replace(/^\//, ''))
      : path.join(currentDir, includePath);
    const includeContent = await fs.readFile(filePath, 'utf8');
    const rendered = await resolveIncludes(includeContent, path.dirname(filePath), macros);
    content = content.slice(0, match.index) + rendered + content.slice(match.index + match[0].length);
    includeRegex.lastIndex = match.index + rendered.length;
  }

  const macroDefRegex = /<#macro\s+([a-zA-Z0-9_]+)([^>]*)>([\s\S]*?)<\/\#macro>/g;
  let macroMatch;
  while ((macroMatch = macroDefRegex.exec(content)) !== null) {
    const name = macroMatch[1];
    const attrString = macroMatch[2];
    const body = macroMatch[3];
    macros[name] = { body, attributes: parseTagAttributes(attrString) };
  }
  content = content.replace(macroDefRegex, '');

  const macroCallRegex = /<@([a-zA-Z0-9_]+)\s+([\s\S]*?)\s*\/>/g;
  content = content.replace(macroCallRegex, (match, name, attrString) => {
    const macro = macros[name];
    if (!macro) return '';
    const args = parseTagAttributes(attrString);
    return replaceVariables(macro.body, args);
  });

  return content;
}

function getValueFromContext(context, expr) {
  const cleaned = expr.trim();
  if (!cleaned) return '';
  
  const methodCallMatch = cleaned.match(/^(\w+(?:\.\w+)*)\.(\w+)\(\)$/);
  if (methodCallMatch) {
    const baseExpr = methodCallMatch[1];
    const methodName = methodCallMatch[2];
    const pathSegments = baseExpr.split('.');
    let value = context;
    for (const segment of pathSegments) {
      if (value == null) return '';
      value = value[segment];
    }
    if (value != null && typeof value[methodName] === 'function') {
      value = value[methodName]();
    }
    return value == null ? '' : value;
  }
  
  const pathSegments = cleaned.replace(/^\$?\{?\(?/, '').replace(/\)?\}?$/, '').split('.');
  let value = context;
  for (const segment of pathSegments) {
    if (value == null) return '';
    value = value[segment];
  }
  return value == null ? '' : value;
}

function replaceVariables(content, context) {
  let result = content;

  result = result.replace(/<#list\s+([\w.()]+)\s+as\s+(\w+)>([\s\S]*?)<\/#list>/g, (match, listExpr, itemVar, body) => {
    let items = getValueFromContext(context, listExpr);
    
    if (typeof items === 'object' && items !== null && typeof items.getList === 'function') {
      items = items.getList();
    }
    
    if (!Array.isArray(items)) return '';
    
    return items.map((item, idx) => {
      const itemContext = { ...context, [itemVar]: item, item_index: idx };
      let itemBody = body;
      
      itemBody = itemBody
        .replace(/\$\{\(([^)]+)\)!?\}/g, (_, expr) => getValueFromContext(itemContext, expr))
        .replace(/\$\{([^}]+)\}!?/g, (_, expr) => getValueFromContext(itemContext, expr));
      
      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#elseif ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#else>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2, body3) => {
        const checkVal1 = getValueFromContext(itemContext, var1);
        if (String(checkVal1) === String(val1)) {
          return body1;
        }
        const checkVal2 = getValueFromContext(itemContext, var2);
        if (String(checkVal2) === String(val2)) {
          return body2;
        }
        return body3;
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#elseif ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2) => {
        const checkVal1 = getValueFromContext(itemContext, var1);
        if (String(checkVal1) === String(val1)) {
          return body1;
        }
        const checkVal2 = getValueFromContext(itemContext, var2);
        if (String(checkVal2) === String(val2)) {
          return body2;
        }
        return '';
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#else>([\s\S]*?)<\/#if>/g, (match, varExpr, compareVal, body1, body2) => {
        const val = getValueFromContext(itemContext, varExpr);
        if (String(val) === String(compareVal)) {
          return body1;
        }
        return body2;
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([^<]*?)<\/#if>/g, (match, varExpr, compareVal, body) => {
        const val = getValueFromContext(itemContext, varExpr);
        if (String(val) === String(compareVal)) {
          return body;
        }
        return '';
      });
      
      return itemBody;
    }).join('');
  });

  result = result
    .replace(/\$\{\(([^)]+)\)!?\}/g, (_, expr) => getValueFromContext(context, expr))
    .replace(/\$\{([^}]+)\}!?/g, (_, expr) => getValueFromContext(context, expr));

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#\/if>/g, (match, varExpr, compareVal, body) => {
    const val = getValueFromContext(context, varExpr);
    if (String(val) === String(compareVal)) {
      return body;
    }
    return '';
  });

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#elseif\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2) => {
    const checkVal1 = getValueFromContext(context, var1);
    if (String(checkVal1) === String(val1)) {
      return body1;
    }
    const checkVal2 = getValueFromContext(context, var2);
    if (String(checkVal2) === String(val2)) {
      return body2;
    }
    return '';
  });

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#else>([\s\S]*?)<#\/if>/g, (match, varExpr, compareVal, body1, body2) => {
    const val = getValueFromContext(context, varExpr);
    if (String(val) === String(compareVal)) {
      return body1;
    }
    return body2;
  });

  return result;
}

function evaluateExpression(expr, context) {
  const trimmed = expr.trim();
  
  const arithmeticMatch = trimmed.match(/^(\w+)\s*([+\-*/])\s*(.+)$/);
  if (arithmeticMatch) {
    const left = getValueFromContext(context, arithmeticMatch[1]);
    const op = arithmeticMatch[2];
    const rightStr = arithmeticMatch[3].trim();
    const right = /^\d+$/.test(rightStr) ? parseInt(rightStr, 10) : getValueFromContext(context, rightStr);
    
    if (typeof left === 'number' && typeof right === 'number') {
      switch (op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
      }
    }
  }
  
  const comparisonMatch = trimmed.match(/^(\w+)\s*([<>=!]+)\s*(.+)$/);
  if (comparisonMatch) {
    const left = getValueFromContext(context, comparisonMatch[1]);
    const op = comparisonMatch[2];
    const rightStr = comparisonMatch[3].trim();
    const right = /^\d+$/.test(rightStr) ? parseInt(rightStr, 10) : getValueFromContext(context, rightStr);
    
    if (typeof left === 'number' && typeof right === 'number') {
      switch (op) {
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '==': return left == right;
        case '!=': return left != right;
      }
    }
  }
  
  const orMatch = trimmed.match(/^\((.+)\)\s*\|\|\s*\((.+)\)$/);
  if (orMatch) {
    const left = evaluateExpression(orMatch[1], context);
    const right = evaluateExpression(orMatch[2], context);
    return left || right;
  }
  
  const parenMatch = trimmed.match(/^\((.+)\)$/);
  if (parenMatch) {
    return evaluateExpression(parenMatch[1], context);
  }
  
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  
  return getValueFromContext(context, trimmed);
}

function replaceVariablesExtended(content, context) {
  let result = content;

  result = result.replace(/<#list\s+([\w.()]+)\s+as\s+(\w+)>([\s\S]*?)<\/#list>/g, (match, listExpr, itemVar, body) => {
    let items = getValueFromContext(context, listExpr);
    
    if (typeof items === 'object' && items !== null && typeof items.getList === 'function') {
      items = items.getList();
    }
    
    if (!Array.isArray(items)) return '';
    
    return items.map((item, idx) => {
      const itemContext = { ...context, [itemVar]: item, item_index: idx };
      let itemBody = body;
      
      itemBody = itemBody.replace(/<#local\s+(\w+)\s*=\s*(.+?)>/g, (match, varName, expr) => {
        const value = evaluateExpression(expr, itemContext);
        itemContext[varName] = value;
        return '';
      });
      
      itemBody = itemBody.replace(/<#return>/g, () => {
        return '';
      });
      
      itemBody = itemBody
        .replace(/\$\{\(([^)]+)\)!?\}/g, (_, expr) => getValueFromContext(itemContext, expr))
        .replace(/\$\{([^}]+)\)!?/g, (_, expr) => getValueFromContext(itemContext, expr));
      
      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#elseif ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#else>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2, body3) => {
        const checkVal1 = getValueFromContext(itemContext, var1);
        if (String(checkVal1) === String(val1)) {
          return body1;
        }
        const checkVal2 = getValueFromContext(itemContext, var2);
        if (String(checkVal2) === String(val2)) {
          return body2;
        }
        return body3;
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#elseif ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2) => {
        const checkVal1 = getValueFromContext(itemContext, var1);
        if (String(checkVal1) === String(val1)) {
          return body1;
        }
        const checkVal2 = getValueFromContext(itemContext, var2);
        if (String(checkVal2) === String(val2)) {
          return body2;
        }
        return '';
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([\s\S]*?)<#else>([\s\S]*?)<\/#if>/g, (match, varExpr, compareVal, body1, body2) => {
        const val = getValueFromContext(itemContext, varExpr);
        if (String(val) === String(compareVal)) {
          return body1;
        }
        return body2;
      });

      itemBody = itemBody.replace(/<#if ([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)==(\d+)>([^<]*?)<\/#if>/g, (match, varExpr, compareVal, body) => {
        const val = getValueFromContext(itemContext, varExpr);
        if (String(val) === String(compareVal)) {
          return body;
        }
        return '';
      });
      
      itemBody = itemBody.replace(/<#list\s+(\w+)\.\.(\w+)\s+as\s+(\w+)>([\s\S]*?)<\/#list>/g, (match, startVar, endVar, loopVar, loopBody) => {
        const start = getValueFromContext(itemContext, startVar);
        const end = getValueFromContext(itemContext, endVar);
        if (typeof start !== 'number' || typeof end !== 'number') return '';
        
        let result = '';
        for (let i = start; i <= end; i++) {
          const loopContext = { ...itemContext, [loopVar]: i };
          let processedBody = loopBody
            .replace(/\$\{\(([^)]+)\)!?\}/g, (_, expr) => getValueFromContext(loopContext, expr))
            .replace(/\$\{([^}]+)\)!?/g, (_, expr) => getValueFromContext(loopContext, expr));
          result += processedBody;
        }
        return result;
      });
      
      return itemBody;
    }).join('');
  });

  result = result.replace(/<#local\s+(\w+)\s*=\s*(.+?)>/g, (match, varName, expr) => {
    const value = evaluateExpression(expr, context);
    context[varName] = value;
    return '';
  });

  result = result.replace(/<#return>/g, () => {
    return '';
  });

  result = result.replace(/<#if\s+\((.+?)\)\s*\|\|\s*\((.+?)\)>[\s\S]*?<\/#if>/g, (match, cond1, cond2, body) => {
    const val1 = evaluateExpression(cond1, context);
    const val2 = evaluateExpression(cond2, context);
    if (val1 || val2) {
      return body;
    }
    return '';
  });

  result = result
    .replace(/\$\{\(([^)]+)\)!?\}/g, (_, expr) => getValueFromContext(context, expr))
    .replace(/\$\{([^}]+)\)!?/g, (_, expr) => getValueFromContext(context, expr));

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#\/if>/g, (match, varExpr, compareVal, body) => {
    const val = getValueFromContext(context, varExpr);
    if (String(val) === String(compareVal)) {
      return body;
    }
    return '';
  });

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#elseif\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<\/#if>/g, (match, var1, val1, body1, var2, val2, body2) => {
    const checkVal1 = getValueFromContext(context, var1);
    if (String(checkVal1) === String(val1)) {
      return body1;
    }
    const checkVal2 = getValueFromContext(context, var2);
    if (String(checkVal2) === String(val2)) {
      return body2;
    }
    return '';
  });

  result = result.replace(/<#if\s+(\w+(?:\.\w+)*)\s*==\s*(\d+)>([\s\S]*?)<#else>([\s\S]*?)<#\/if>/g, (match, varExpr, compareVal, body1, body2) => {
    const val = getValueFromContext(context, varExpr);
    if (String(val) === String(compareVal)) {
      return body1;
    }
    return body2;
  });

  return result;
}

async function renderTemplate(templatePath, context = {}) {
  const absolutePath = sanitizeTemplatePath(templatePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const withIncludes = await resolveIncludes(raw, path.dirname(absolutePath));
  return replaceVariablesExtended(withIncludes, context);
}

async function renderTemplateRoute(req, res, next) {
  if (!req.query.template) {
    return next();
  }
  try {
    const templatePath = req.query.template;
    const context = {};

    if (templatePath.includes('planset/plan.html')) {
      const page = parseInt(req.query.pno || req.body.pno || '1', 10) || 1;
      const pageSize = 6;
      const allPlans = await queryEntities('gc_schedule_plan', '1=1', 'pid desc', '*');
      const totalRows = allPlans.length;
      const totalPage = Math.max(1, Math.ceil(totalRows / pageSize));
      const rows = allPlans.slice((page - 1) * pageSize, page * pageSize);
      context.resultPage = {
        pageNumber: page,
        pageSize,
        totalRow: totalRows,
        totalPage,
        list: rows,
        getList: function() { return this.list; }
      };
    }

    if (templatePath.includes('planset/edit.html') && (req.query.pid || req.body.pid)) {
      const pid = req.query.pid || req.body.pid;
      const plans = await queryEntities('gc_schedule_plan', `pid=${pid}`, '', '*');
      context.result = plans.length ? plans[0] : {};
    }

    const html = await renderTemplate(templatePath, context);
    return res.send(html);
  } catch (err) {
    console.error('Template render error:', err);
    return res.status(500).send(`Template render error: ${err.message}`);
  }
}

function getRawWhere(req) {
  return req.body.whereString || req.query.whereString || '1=1';
}

function getRawSelect(req) {
  return req.body.selectFields || req.query.selectFields || '*';
}

function getRawOrder(req) {
  return req.body.orderString || req.query.orderString || '';
}

// 导出班表接口 (POST - 接收前端数据)
app.post('/FinalScheduler/export/schedule', async (req, res) => {
  try {
    console.log('========== 导出班表接口被调用 ==========');
    const { month, data } = req.body;
    
    console.log('月份:', month);
    console.log('数据行数:', data ? data.length : 0);
    
    if (!month) {
      return res.status(400).json({ error: '请选择月份' });
    }
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '无效的班表数据' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(month + '班表');

    // 1. 添加数据并设置样式
    const daysInMonth = data[0].length - 1; // 减去姓名列
    
    data.forEach((row, rowIndex) => {
      const excelRow = worksheet.addRow(row);
      
      row.forEach((cell, colIndex) => {
        const cellObj = excelRow.getCell(colIndex + 1);
        
        // 设置对齐方式：居中
        cellObj.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: false
        };
        
        // 设置边框
        cellObj.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
        
        // 表头行样式（第一行）
        if (rowIndex === 0) {
          cellObj.font = { 
            name: 'Microsoft YaHei',
            size: 11,
            bold: true,
            color: { argb: 'FF000000' }
          };
          cellObj.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' } // 浅灰色背景
          };
          cellObj.alignment = { 
            vertical: 'middle', 
            horizontal: 'center',
            wrapText: false
          };
        }
        // 数据行样式
        else {
          // 姓名列（第一列）样式
          if (colIndex === 0) {
            cellObj.font = { 
              name: 'Microsoft YaHei',
              size: 10,
              bold: true,
              color: { argb: 'FF333333' }
            };
            cellObj.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF7F7F7' } // 浅灰色背景
            };
          }
          // 数据列样式
          else {
            cellObj.font = { 
              name: 'Microsoft YaHei',
              size: 10,
              bold: false,
              color: { argb: 'FF333333' }
            };
            
            // 根据班次设置背景色和文字颜色
            if (cell === '白班') {
              cellObj.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF0AD4E' } // 橙色背景（与前端一致）
              };
              cellObj.font = { 
                name: 'Microsoft YaHei',
                size: 10,
                bold: true,
                color: { argb: 'FFFFFFFF' } // 白色文字
              };
            } else if (cell === '夜班') {
              cellObj.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9534F' } // 红色背景（与前端一致）
              };
              cellObj.font = { 
                name: 'Microsoft YaHei',
                size: 10,
                bold: true,
                color: { argb: 'FFFFFFFF' } // 白色文字
              };
            } else {
              // 休息
              cellObj.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9EDF7' } // 浅蓝色背景（与前端一致）
              };
            }
          }
        }
      });
    });

    // 2. 设置列宽
    worksheet.getColumn(1).width = 15; // 姓名列
    for (let i = 2; i <= daysInMonth + 1; i++) {
      worksheet.getColumn(i).width = 8; // 日期列
    }

    // 3. 设置行高
    worksheet.getRow(1).height = 25; // 表头行高
    for (let i = 2; i <= data.length; i++) {
      worksheet.getRow(i).height = 20; // 数据行高
    }

    // 4. 冻结首行和首列
    worksheet.views = [
      { 
        state: 'frozen', 
        xSplit: 1, 
        ySplit: 1,
        topLeftCell: 'B2',
        activeCell: 'B2'
      }
    ];

    // 5. 生成 buffer
    const buf = await workbook.xlsx.writeBuffer();

    console.log('Excel文件生成成功，大小:', buf.length, 'bytes');

    // 6. 设置响应头，触发浏览器下载
    const filename = `${month}_班表.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buf.length);
    
    // 7. 发送文件
    res.send(buf);
    console.log('文件已发送');
  } catch (error) {
    console.error('导出失败:', error);
    res.status(500).json({ error: '导出班表失败: ' + error.message });
  }
});

// 历史排班数据保存路径
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'schedule_history.json');

// 确保历史数据目录存在
async function ensureHistoryDir() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  if (!fsSync.existsSync(HISTORY_FILE)) {
    await fs.writeFile(HISTORY_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
}

// 保存历史排班数据
app.post('/FinalScheduler/api/saveHistory', async (req, res) => {
  try {
    const { month, history } = req.body;
    
    if (!month || !history) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    console.log('保存历史排班:', month);

    // 确保目录存在
    await ensureHistoryDir();

    // 读取现有的历史数据
    let allHistory = {};
    try {
      const rawData = await fs.readFile(HISTORY_FILE, 'utf8');
      allHistory = JSON.parse(rawData);
    } catch (err) {
      console.log('历史文件不存在，将创建新文件');
    }

    // 更新该月份的数据
    allHistory[month] = history;

    // 保存回文件
    await fs.writeFile(HISTORY_FILE, JSON.stringify(allHistory, null, 2), 'utf8');

    console.log('历史排班保存成功:', month);
    res.json({ 
      success: true, 
      message: '保存成功',
      month: month 
    });
  } catch (error) {
    console.error('保存历史排班失败:', error);
    res.status(500).json({ error: '保存失败: ' + error.message });
  }
});

// 加载历史排班数据
app.get('/FinalScheduler/api/loadHistory', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: '请提供月份参数' });
    }

    console.log('加载历史排班:', month);

    // 确保目录存在
    await ensureHistoryDir();

    // 读取历史数据
    let allHistory = {};
    try {
      const rawData = await fs.readFile(HISTORY_FILE, 'utf8');
      allHistory = JSON.parse(rawData);
    } catch (err) {
      console.log('历史文件不存在');
      return res.json({ history: null });
    }

    const history = allHistory[month] || null;
    console.log('历史排班加载成功:', month, history ? '有数据' : '无数据');
    
    res.json({ 
      success: true,
      month: month,
      history: history 
    });
  } catch (error) {
    console.error('加载历史排班失败:', error);
    res.status(500).json({ error: '加载失败: ' + error.message });
  }
});

// 加载所有历史排班数据
app.get('/FinalScheduler/api/loadAllHistory', async (req, res) => {
  try {
    console.log('加载所有历史排班数据');

    // 确保目录存在
    await ensureHistoryDir();

    // 读取历史数据
    let allHistory = {};
    try {
      const rawData = await fs.readFile(HISTORY_FILE, 'utf8');
      allHistory = JSON.parse(rawData);
    } catch (err) {
      console.log('历史文件不存在');
      return res.json({ history: {} });
    }

    console.log('所有历史排班加载成功，共', Object.keys(allHistory).length, '个月份');
    
    res.json({ 
      success: true,
      history: allHistory 
    });
  } catch (error) {
    console.error('加载所有历史排班失败:', error);
    res.status(500).json({ error: '加载失败: ' + error.message });
  }
});

// 删除指定月份的历史排班数据
app.delete('/FinalScheduler/api/deleteHistory', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: '请提供月份参数' });
    }

    console.log('删除历史排班:', month);

    // 确保目录存在
    await ensureHistoryDir();

    // 读取历史数据
    let allHistory = {};
    try {
      const rawData = await fs.readFile(HISTORY_FILE, 'utf8');
      allHistory = JSON.parse(rawData);
    } catch (err) {
      console.log('历史文件不存在');
      return res.json({ success: true, message: '数据不存在' });
    }

    // 删除指定月份
    if (allHistory[month]) {
      delete allHistory[month];
      await fs.writeFile(HISTORY_FILE, JSON.stringify(allHistory, null, 2), 'utf8');
      console.log('历史排班删除成功:', month);
      res.json({ 
        success: true, 
        message: '删除成功',
        month: month 
      });
    } else {
      console.log('该月份数据不存在:', month);
      res.json({ 
        success: true, 
        message: '数据不存在',
        month: month 
      });
    }
  } catch (error) {
    console.error('删除历史排班失败:', error);
    res.status(500).json({ error: '删除失败: ' + error.message });
  }
});

app.post('/FinalScheduler/*', renderTemplateRoute);
app.get('/FinalScheduler/*', renderTemplateRoute);

app.get('/FinalScheduler/', async (req, res) => {
  try {
    const html = await renderTemplate('WEB-INF/views/index.html', {});
    res.send(html);
  } catch (err) {
    res.status(500).send(`Error loading index.html: ${err.message}`);
  }
});

app.get('/FinalScheduler/pageSelectPerson', async (req, res) => {
  const page = parseInt(req.query.page || '1', 10) || 1;
  const rows = parseInt(req.query.rows || '10', 10) || 10;
  const persons = await queryEntities('gc_schedule_person', '1=1', 'pid desc', '*');
  const result = persons.slice((page - 1) * rows, page * rows);
  return res.json({ total: persons.length, rows: result });
});

app.get('/FinalScheduler/queryPerson', async (req, res) => {
  const whereString = req.query.whereString || '1=1';
  const data = await queryEntities('gc_schedule_person', whereString, 'pid desc', '*');
  return res.json(data);
});

app.post('/FinalScheduler/queryPerson', async (req, res) => {
  const whereString = req.body.whereString || '1=1';
  const data = await queryEntities('gc_schedule_person', whereString, 'pid desc', '*');
  return res.json(data);
});

app.get('/FinalScheduler/delPerson/:id', async (req, res) => {
  const result = await deleteById('gc_schedule_person', 'pid', req.params.id);
  return res.json(result);
});

app.post('/FinalScheduler/delPerson', async (req, res) => {
  let ids = [];
  try {
    if (req.body.ids) {
      if (typeof req.body.ids === 'string') {
        ids = JSON.parse(req.body.ids);
      } else if (Array.isArray(req.body.ids)) {
        ids = req.body.ids;
      }
    }
  } catch (err) {
    console.error('Parse ids error:', err);
  }
  if (!ids || !ids.length) return res.json(false);
  const store = await loadStore();
  const collection = getCollection(store, 'gc_schedule_person');
  const originalLength = collection.length;
  store['gc_schedule_person'] = collection.filter((item) => !ids.includes(Number(item.pid)) && !ids.includes(String(item.pid)));
  const changed = store['gc_schedule_person'].length < originalLength;
  if (changed) {
    await saveStore(store);
  }
  return res.json(changed);
});

app.post('/FinalScheduler/commitPerson', async (req, res) => {
  const inserted = parseJsonArray(req.body.inserted);
  const updated = parseJsonArray(req.body.updated);
  const insertedResult = await saveEntities('gc_schedule_person', inserted, 'pid');
  const updatedResult = await updateEntities('gc_schedule_person', updated, 'pid');
  return res.json(insertedResult || updatedResult);
});

app.get('/FinalScheduler/queryDict', async (req, res) => {
  const filter = req.query.filter;
  if (!filter) return res.json([]);
  const data = await queryEntities('gc_common_dict', `domainName='${filter}'`, 'dictCode asc', 'dictCode,dictName');
  return res.json(data);
});

app.get('/FinalScheduler/plan/getList', async (req, res) => {
  const data = await queryEntities('gc_schedule_plan', '1=1', 'pid desc', '*');
  return res.json(data);
});

app.get('/FinalScheduler/plan/getPlanOrderList', async (req, res) => {
  const data = await queryEntities('gc_schedule_planorder', '1=1', 'id desc', '*');
  return res.json(data);
});

app.post('/FinalScheduler/plan/save', async (req, res) => {
  const inserted = parseJsonArray(req.body.inserted);
  const result = await saveEntities('gc_schedule_plan', inserted, 'pid');
  return res.json(result);
});

app.post('/FinalScheduler/plan/update', async (req, res) => {
  const updated = parseJsonArray(req.body.updated);
  const result = await updateEntities('gc_schedule_plan', updated, 'pid');
  return res.json(result);
});

app.get('/FinalScheduler/plan/delete/:id', async (req, res) => {
  const result = await deleteById('gc_schedule_plan', 'pid', req.params.id);
  return res.json(result);
});

app.get('/FinalScheduler/plan/delPlanOrder', async (req, res) => {
  const result = await clearCollection('gc_schedule_planorder');
  return res.json(result);
});

app.post('/FinalScheduler/plan/savePlanOrder', async (req, res) => {
  const inserted = parseJsonArray(req.body.inserted);
  const result = await saveEntities('gc_schedule_planorder', inserted, 'id');
  return res.json(result);
});

app.post('/FinalScheduler/plan/updatePlanOrder', async (req, res) => {
  const updated = parseJsonArray(req.body.updated);
  const result = await updateEntities('gc_schedule_planorder', updated, 'id');
  return res.json(result);
});

app.get('/FinalScheduler/schedule/getGroupPersonList', async (req, res) => {
  const whereString = getRawWhere(req);
  const orderString = getRawOrder(req) || 'gid desc';
  const data = await queryEntities('gc_schedule_group_person_v', whereString, orderString, '*');
  return res.json(data);
});

app.get('/FinalScheduler/schedule/getSchedulerList', async (req, res) => {
  const whereString = req.query.whereString || '1=1';
  const data = await queryEntities('gc_schedule_scheduler', whereString, 'id asc', '*');
  return res.json(data);
});

app.post('/FinalScheduler/schedule/updateSchedule', async (req, res) => {
  const setFields = req.body.setFields;
  const whereString = req.body.whereString || '1=1';
  if (!setFields) return res.json(0);
  const store = await loadStore();
  const collection = getCollection(store, 'gc_schedule_scheduler');
  const predicate = makePredicate(whereString);
  const updates = parseSetFields(setFields);
  let count = 0;
  collection.forEach((item) => {
    if (predicate(item)) {
      Object.assign(item, updates);
      count += 1;
    }
  });
  if (count > 0) {
    await saveStore(store);
  }
  return res.json(count);
});

app.post('/FinalScheduler/schedule/saveSchedule', async (req, res) => {
  const inserted = parseJsonArray(req.body.inserted);
  const result = await saveEntities('gc_schedule_scheduler', inserted, 'id');
  return res.json(result);
});

app.get('/FinalScheduler/queryGroup', async (req, res) => {
  const selectFields = getRawSelect(req);
  const whereString = getRawWhere(req);
  const orderString = getRawOrder(req) || 'gid asc';
  const data = await queryEntities('gc_schedule_group', whereString, orderString, selectFields);
  return res.json(data);
});

app.post('/FinalScheduler/queryGroup', async (req, res) => {
  const selectFields = getRawSelect(req);
  const whereString = getRawWhere(req);
  const orderString = getRawOrder(req) || 'gid asc';
  const data = await queryEntities('gc_schedule_group', whereString, orderString, selectFields);
  return res.json(data);
});

app.post('/FinalScheduler/saveGroup', async (req, res) => {
  const inserted = parseJsonArray(req.body.inserted);
  const updated = parseJsonArray(req.body.updated);
  const insertedResult = await saveEntities('gc_schedule_group', inserted, 'gid');
  const updatedResult = await updateEntities('gc_schedule_group', updated, 'gid');
  return res.json(insertedResult || updatedResult);
});

app.get('/FinalScheduler/delGroupById/:id', async (req, res) => {
  const result = await deleteById('gc_schedule_group', 'gid', req.params.id);
  return res.json(result);
});

app.get('/FinalScheduler/delAllGroup', async (req, res) => {
  const result = await clearCollection('gc_schedule_group');
  return res.json(result);
});

app.post('/FinalScheduler/updateGroup', async (req, res) => {
  const setFields = req.body.setFields;
  const whereString = req.body.whereString || '1=1';
  if (!setFields) return res.json(0);
  const store = await loadStore();
  const collection = getCollection(store, 'gc_schedule_group');
  const predicate = makePredicate(whereString);
  const updates = parseSetFields(setFields);
  let count = 0;
  collection.forEach((item) => {
    if (predicate(item)) {
      Object.assign(item, updates);
      count += 1;
    }
  });
  if (count > 0) {
    await saveStore(store);
  }
  return res.json(count);
});

app.get('/FinalScheduler/check/getEntityList', async (req, res) => {
  const whereString = req.query.whereString || '1=1';
  const selectFields = req.query.selectFields || '*';
  const orderString = req.query.orderString || 'pid asc';
  const data = await queryEntities('gc_schedule_check_statistics_v', whereString, orderString, selectFields);
  return res.json(data);
});

app.use('/FinalScheduler', express.static(APP_ROOT));

app.use((err, req, res, next) => {
  console.error('Express error handler:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`FinalScheduler Node server running at http://localhost:${PORT}/FinalScheduler/`);
});