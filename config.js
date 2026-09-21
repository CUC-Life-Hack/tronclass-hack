import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
	entry: path.resolve(__dirname, 'src/main.js'),
	outDir: path.resolve(__dirname, 'dist'),
	devOutDir: path.resolve(__dirname, 'dev'),
	userscript: {
		name: '畅课 Hack',
		version: '1.7.1',
		include: /^https?:\/\/courses\.cuc\.edu\.cn\//,
		url: 'https://github.com/CUC-Life-Hack/tronclass-hack/raw/master/dist/main.user.js',
		grants: ['unsafeWindow'],
	},
};