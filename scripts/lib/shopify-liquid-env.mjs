/* A small Shopify-flavoured Liquid environment: enough of the real tags and
   filters to parse and render the theme offline, so the sections are tested
   before they are shared rather than after. */
import { Liquid, Tag, Hash, TokenKind } from 'liquidjs';

export function makeEngine (assetBase = './assets/') {
  const engine = new Liquid({ strictFilters: true, strictVariables: false, jsTruthy: true });

  /* ── tags Shopify adds ────────────────────────────────────────────── */
  // {% schema %} … {% endschema %}  — editor metadata, renders nothing.
  engine.registerTag('schema', {
    parse (token, remain) {
      this.body = [];
      while (remain.length) {
        const t = remain.shift();
        if (t.kind === TokenKind.Tag && t.name === 'endschema') return;
        this.body.push(t.getText ? t.getText() : String(t.input ?? ''));
      }
      throw new Error('schema tag was never closed');
    },
    render () { return ''; }
  });

  // {% form 'customer', class: 'x' %} … {% endform %}
  engine.registerTag('form', class extends Tag {
    constructor (token, remain, liquid, parser) {
      super(token, remain, liquid);
      const tk = this.tokenizer;
      this.kind = tk.readValue();
      tk.skipBlank();
      if (tk.peek() === ',') tk.advance();
      this.hash = new Hash(tk.remaining());
      this.templates = [];
      const stream = parser.parseStream(remain)
        .on('tag:endform', () => stream.stop())
        .on('template', (tpl) => this.templates.push(tpl))
        .on('end', () => { throw new Error('form tag was never closed'); });
      stream.start();
    }
    * render (ctx, emitter) {
      const hash = yield this.hash.render(ctx);
      const attrs = Object.entries(hash)
        .map(([k, v]) => ` ${k}="${String(v)}"`).join('');
      emitter.write(`<form method="post" action="/contact#contact_form"${attrs}>`);
      ctx.push({ form: { errors: null, posted_successfully: false } });
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      ctx.pop();
      emitter.write('</form>');
    }
  });

  // {% style %}, {% javascript %}, {% stylesheet %} pass their body through.
  for (const [name, wrap] of [['style', (s) => `<style>${s}</style>`],
                              ['stylesheet', (s) => `<style>${s}</style>`],
                              ['javascript', (s) => `<script>${s}</script>`]]) {
    engine.registerTag(name, class extends Tag {
      constructor (token, remain, liquid, parser) {
        super(token, remain, liquid);
        this.templates = [];
        const stream = parser.parseStream(remain)
          .on(`tag:end${name}`, () => stream.stop())
          .on('template', (tpl) => this.templates.push(tpl))
          .on('end', () => { throw new Error(`${name} tag was never closed`); });
        stream.start();
      }
      * render (ctx, emitter) {
        emitter.write(wrap(''));
        yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      }
    });
  }

  // {% section 'name' %} / {% sections 'group' %} — the layout pulls these in.
  // Rendering them here is the whole-page harness's job, not the parser's.
  for (const name of ['section', 'sections']) {
    engine.registerTag(name, {
      parse (token) { this.value = token.args; },
      render () { return ''; }
    });
  }

  /* ── filters Shopify adds ─────────────────────────────────────────── */
  const kw = (args) => {
    // liquidjs hands named filter args over as [key, value] pairs.
    const out = {};
    for (const a of args) {
      if (Array.isArray(a) && a.length === 2 && typeof a[0] === 'string') out[a[0]] = a[1];
      else if (a && typeof a === 'object' && !Array.isArray(a)) Object.assign(out, a);
    }
    return out;
  };

  engine.registerFilter('asset_url', (v) => `${assetBase}${v}`);
  engine.registerFilter('stylesheet_tag', (v) => `<link rel="stylesheet" href="${v}">`);
  engine.registerFilter('script_tag', (v) => `<script src="${v}" defer></script>`);
  engine.registerFilter('image_url', function (img, ...args) {
    const o = kw(args);
    const src = (img && (img.src || img.url)) || img || '';
    if (!src) return '';
    return o.width ? `${src}?width=${o.width}` : String(src);
  });
  engine.registerFilter('img_url', (img, size) => `${(img && img.src) || img || ''}?size=${size}`);
  engine.registerFilter('image_tag', function (url, ...args) {
    const o = kw(args);
    const attr = { src: url };
    if (o.widths) {
      const base = String(url).split('?')[0];
      attr.srcset = String(o.widths).split(',').map((w) => {
        w = w.trim(); return `${base}?width=${w} ${w}w`;
      }).join(', ');
    }
    for (const k of ['class', 'loading', 'sizes', 'alt', 'width', 'height', 'id']) {
      if (o[k] !== undefined) attr[k] = o[k];
    }
    if (attr.alt === undefined) attr.alt = '';
    return '<img ' + Object.entries(attr)
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ') + '>';
  });
  engine.registerFilter('money', (cents) =>
    `$${(Number(cents || 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
  engine.registerFilter('money_with_currency', (c) => `$${(Number(c || 0) / 100).toFixed(2)} USD`);
  engine.registerFilter('handleize', (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  engine.registerFilter('handle', (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  engine.registerFilter('t', (s) => String(s));
  engine.registerFilter('within', (url) => url);
  engine.registerFilter('link_to', (s, url) => `<a href="${url}">${s}</a>`);
  engine.registerFilter('placeholder_svg_tag', (s) => `<svg class="${s}"></svg>`);
  engine.registerFilter('inline_asset_content', (s) => String(s));
  engine.registerFilter('metafield_text', (s) => String(s));
  engine.registerFilter('json', (v) => JSON.stringify(v));
  engine.registerFilter('default_errors', (e) => (e ? String(e) : ''));
  engine.registerFilter('format_address', (a) => {
    if (!a) return '';
    return ['address1', 'address2', 'city', 'zip', 'country']
      .map((k) => a[k]).filter(Boolean).join('<br>');
  });
  engine.registerFilter('payment_button', () => '<button type="submit">Buy it now</button>');
  engine.registerFilter('payment_terms', () => '');
  engine.registerFilter('customer_login_link', (s) => `<a href="/account/login">${s}</a>`);
  engine.registerFilter('customer_logout_link', (s) => `<a href="/account/logout">${s}</a>`);
  engine.registerFilter('asset_img_url', (v) => `${assetBase}${v}`);
  engine.registerFilter('file_url', (v) => `/files/${v}`);
  engine.registerFilter('weight_with_unit', (v) => `${v} g`);

  return engine;
}
