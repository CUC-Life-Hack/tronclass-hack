import path from 'path';
import url from 'url';
import webpack from 'webpack';
import { UserscriptPlugin as WebpackUserscript } from 'webpack-userscript';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argvMode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1];
const production = argvMode === 'production'
	|| process.env.NODE_ENV === 'production'
	|| !!process.env.npm_config_production;

export default {
	mode: production ? 'production' : 'development',
	entry: path.resolve(__dirname, 'src/main.js'),
	output: {
		path: path.resolve(__dirname, production ? 'dist' : 'dev'),
		filename: 'main.js',
		clean: true,
	},
	module: {
		rules: [{
			test: /\.css$/,
			use: ['style-loader', 'css-loader'],
		}],
	},
	performance: {
		hints: false,
	},
	plugins: [
		new WebpackUserscript({
			headers: {
				name: '畅课 Hack',
				version: '1.6.1',
				grant: ['unsafeWindow'],
				// Match the whole site: TronClass is an SPA and switches to the
				// full-screen video route via the hash without reloading, so the
				// script must already be present. Route filtering happens at runtime.
				include: /^https?:\/\/courses\.cuc\.edu\.cn\//.toString(),
				match: ['*://courses.cuc.edu.cn/*'],
			},
			downloadBaseURL: 'https://github.com/CUC-Life-Hack/tronclass-hack/raw/master/dist/main.user.js',
			metajs: false,
			renameExt: true,
			pretty: true,
		}),
		new webpack.BannerPlugin({ banner: 'CUC Life Hack userscript' }),
	],
};