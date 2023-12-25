import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { Plugin } from 'vite';


export const viteImportCssSheet = (): Plugin => {
	const virtualModules = new Map<string, string>();
	const filetypes = [ '.ts', '.mts', '.js', '.mjs' ] as const;
	const illegalChars: Record<string, string> = {
		'\\': '\\\\',
		'`':  '\\`',
		'$':  '\\$',
	};

	const cssImportAssertRegex = (str: string) =>
		new RegExp(str + `['"] *(?:with|assert) *{[(?:\r?\n) \t]*type: *['"]css['"][(?:\r?\n) ]*};`);

	const convert = (str: string) => {
		let res = '';
		for (const c of str)
			res += illegalChars[c] || c;

		return `\`${ res }\``;
	};

	return {
		enforce: 'pre',
		name:    'vite-import-css-sheet',
		async resolveId(source, importer) {
			if (source.endsWith('.css')) {
				if (!importer)
					return;

				const resolvedId = await this.resolve(source, importer);
				importer = importer?.split('?')[0];

				if (resolvedId && filetypes.some(str => importer?.endsWith(str))) {
					const importerContent = await readFile(importer!, { encoding: 'utf8' });
					const regxp = cssImportAssertRegex(source);

					if (regxp.test(importerContent)) {
						const modId = '\0virtual:' + randomUUID().replaceAll('-', '');
						virtualModules.set(modId, resolvedId.id);

						return modId;
					}
				}
			}
		},
		async load(id) {
			if (virtualModules.has(id)) {
				const realId = virtualModules.get(id)!;

				try {
					const fileContent = await readFile(realId, { encoding: 'utf8' });
					this.addWatchFile(realId);

					return `
						let sheet;
						try {
							sheet = new CSSStyleSheet()
							sheet.replaceSync(${ convert(fileContent) });
						} catch(err) {
							console.error('Constructable Stylesheets are not supported in your environment.')
						}

						export default sheet;
					`;
				}
				catch (err) {
					console.error('Unable to load asserted css file:' + realId);
				}
			}
		},
	};
};
