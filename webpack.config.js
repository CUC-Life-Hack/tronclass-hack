import path from 'path';
import url from 'url';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import WebpackUserscript from 'webpack-userscript';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const production = !!process.env['npm_config_production'];

export default {
	mode: production ? 'production' : 'development',
	entry: path.resolve(__dirname, 'main.js'),
	output: {
		path: path.resolve(__dirname, production ? 'dist' : 'dev'),
		filename: 'main.js'
	},
	module: {
		rules: [{
			test: /\.css/,
			use: ['style-loader', 'css-loader']
		}]
	},
	plugins: [
		new WebpackUserscript({
			headers: {
				name: '畅课 Hack',
				version: '1.0.5',
				grant: ['unsafeWindow'],
				include: /^http:\/\/courses.cuc.edu.cn\/course\/\d+\/learning-activity\/full-screen#\/\d+$/.toString()
			},
			downloadBaseUrl: 'https://github.com/CUC-Life-Hack/tronclass-hack/raw/master/dist/main.user.js',
			metajs: false,
			renameExt: true,
			pretty: true,
		}),
		new CleanWebpackPlugin()
	]
};
