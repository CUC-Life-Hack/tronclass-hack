import _ from 'lodash';
import Panel from './panel.js';
import { page, Delay } from './ajax.js';

export const Hack = {
	Init: async () => false,
	header: 'CUC Life Hack',
	initTimeout: 5000,
	initAttemptFrequency: 500,

	// Overridable: return true when the current SPA route is one this hack
	// should act on. Defaults to always true.
	Route() {
		return true;
	},

	// Overridable: called once after the first successful Init.
	OnReady() { },

	async Run(layout) {
		Hack.panel = new Panel();
		const mount = () => {
			if(!document.body)
				return false;
			if(!Hack.panel.element.isConnected)
				document.body.appendChild(Hack.panel.element);
			return true;
		};
		mount();
		Hack.panel.SetHeader(Hack.header);

		// Live status line, always visible so the panel is never blank.
		const status = document.createElement('p');
		status.className = 'log';
		status.textContent = '等待初始化…';
		Hack.panel.Append(status);

		let done = false;

		const attempt = async () => {
			if(done)
				return;
			if(!Hack.Route()) {
				status.textContent = `当前不是视频页：${location.href}`;
				return;
			}
			status.textContent = `初始化中… ${location.href}`;
			try {
				await Hack.Init();
				done = true;
				await Delay(300);
				Hack.panel.Clear();
				Hack.panel.Layout(typeof layout === 'function' ? layout(Hack) : layout);
				Hack.OnReady();
			} catch(err) {
				status.textContent = `初始化中… ${err && err.message ? err.message : err} ｜ ${location.href}`;
			}
		};

		// Keep the panel mounted even if the SPA re-renders <body>.
		setInterval(() => {
			mount();
			if(!done)
				attempt();
		}, Hack.initAttemptFrequency);

		// The full-screen activity view is a hash route; TronClass switches to it
		// without a page reload, so re-check whenever the route changes.
		const onRouteChange = () => {
			done = false;
			attempt();
		};
		window.addEventListener('hashchange', onRouteChange);
		window.addEventListener('popstate', onRouteChange);

		await attempt();
	},
};

void page;
void _;
