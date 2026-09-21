import { page, Hack, Delay, PostAjax } from './base/index.js';
import _ from 'lodash';

const REQUIRED_GLOBALS = ['st', 'globalData'];

// TronClass is a hash-routed SPA: the activity view is reached via
// `#/<activityId>` without a page reload. Newer builds dropped the
// `/full-screen` path segment, so match both forms.
const VIDEO_ROUTE = /\/course\/\d+\/learning-activity(?:\/full-screen)?#\/\d+/;

console.log('[畅课 Hack] script injected @', location.href);

async function SafePost(url, body) {
	try {
		return await PostAjax(url, 'POST', {
			'Content-Type': 'application/json;charset=utf-8',
		}, JSON.stringify(body));
	} catch(err) {
		console.error('[TronClass Hack] request failed', url, err);
		return null;
	}
}

_.assign(Hack, {
	header: '畅课 Hack',

	Route() {
		if(VIDEO_ROUTE.test(location.href))
			return true;
		// Fallback: any learning-activity hash route, or a page where a media
		// element is already present.
		if(/\/learning-activity[^#]*#\/\d+/.test(location.href))
			return true;
		return document.querySelector('video') != null;
	},

	// Called once after each successful init (also after SPA route changes).
	OnReady() {
		if(this.autoComplete) {
			const target = this.GetCurrentActivityId();
			setTimeout(() => {
				if(this.GetCurrentActivityId() === target)
					this.CompleteCurrentVideo();
			}, 800);
		}
	},

	async Init() {
		const missing = REQUIRED_GLOBALS.filter(key => !(key in page));

		if(missing.length !== 0) {
			const present = REQUIRED_GLOBALS.filter(key => key in page);
			throw new Error(`缺少 ${missing.join(',')}（已有 ${present.join(',') || '无'}）`);
		}

		// Session info
		this.statistics = page.st;
		const course = this.course = page.globalData.course;
		this.dept = page.globalData.dept;
		this.user = page.globalData.user;

		if(!course)
			throw new Error('globalData.course 缺失');

		// Activity list. The endpoint moved from /api/... to a v1 REST shape on
		// newer TronClass builds; try both and keep whichever answers with JSON.
		const activities = this.activities = await this.FetchActivities(course.id);

		this.videos = (activities || []).filter(activity =>
			activity?.uploads?.some(upload =>
				upload?.videos?.some(video => 'duration' in video)
			)
		);

		// Current site bundles its player, so `window.videojs` no longer exists.
		// Operate on the underlying <video> element instead.
		const video = this.FindVideo();
		if(!video)
			throw new Error('未找到 <video> 元素');

		this.video = video;
		this.$player = video;

		this.InstallPlayerPatches();
		this.WatchForPlayerReplacement();
		this.InstallNetworkSniffer();

		// Transaction guard, only when elasticApm is present (older builds).
		if('elasticApm' in page && page.elasticApm?.serviceFactory?.instances?.TransactionService)
			this.InstallTransactionPatch();
	},

	// Capture the requests the site itself makes so the real progress-report
	// endpoint and payload can be inspected from the panel.
	InstallNetworkSniffer() {
		const W = page;
		if(!W || W.__tchSniffed)
			return;
		W.__tchSniffed = true;

		const captured = this.captured = [];
		const MATCH = /activities-read|online-videos|user-actions|unplayed-segments|video|statistics/i;
		const record = (method, url, body, response) => {
			if(!MATCH.test(String(url)))
				return;
			const toText = value => {
				try {
					return typeof value === 'string' ? value
						: value == null ? null
							: (value instanceof FormData ? '[FormData]' : JSON.stringify(value));
				} catch(err) {
					return '[unserializable]';
				}
			};
			const clip = text => (text && text.length > 800 ? text.slice(0, 800) + '…' : text);
			captured.push({
				at: new Date().toLocaleTimeString(),
				method,
				url: String(url),
				body: clip(toText(body)),
				response: clip(toText(response)),
			});
			if(captured.length > 60)
				captured.shift();
		};

		try {
			const XHR = W.XMLHttpRequest;
			const open = XHR.prototype.open;
			const send = XHR.prototype.send;
			XHR.prototype.open = function(method, url, ...rest) {
				this.__tchMethod = method;
				this.__tchUrl = url;
				return open.call(this, method, url, ...rest);
			};
			XHR.prototype.send = function(body) {
				const xhr = this;
				if(MATCH.test(String(xhr.__tchUrl))) {
					xhr.addEventListener('load', () => {
						let resp = null;
						try {
							resp = xhr.responseType === '' || xhr.responseType === 'text'
								? xhr.responseText
								: `[${xhr.responseType}]`;
						} catch(err) { /* ignore */ }
						record(xhr.__tchMethod || 'GET', xhr.__tchUrl, body, resp);
					});
				} else {
					record(xhr.__tchMethod || 'GET', xhr.__tchUrl, body);
				}
				return send.call(this, body);
			};
		} catch(err) {
			console.warn('[畅课 Hack] XHR sniff failed', err);
		}

		try {
			const originalFetch = W.fetch;
			if(originalFetch) {
				W.fetch = function(input, init) {
					const url = typeof input === 'string' ? input : (input && input.url);
					record((init && init.method) || 'GET', url, init && init.body);
					return originalFetch.apply(this, arguments);
				};
			}
		} catch(err) {
			console.warn('[畅课 Hack] fetch sniff failed', err);
		}

		try {
			const beacon = W.navigator && W.navigator.sendBeacon;
			if(beacon) {
				W.navigator.sendBeacon = function(url, data) {
					record('BEACON', url, data);
					return beacon.apply(this, arguments);
				};
			}
		} catch(err) {
			console.warn('[畅课 Hack] beacon sniff failed', err);
		}
	},

	FindVideo() {
		const videos = Array.from(document.querySelectorAll('video'));
		return videos.find(v => Number.isFinite(v.duration) && v.duration > 0)
			|| videos[0]
			|| null;
	},

	// SPA activity switches can replace the <video> node; re-patch when that
	// happens so speed-lock and auto-seek keep working.
	WatchForPlayerReplacement() {
		if(this.__tchObserver)
			return;
		let last = 0;
		const observer = this.__tchObserver = new MutationObserver(() => {
			const now = Date.now();
			if(now - last < 1000)
				return;
			last = now;
			const video = this.FindVideo();
			if(video && video !== this.video) {
				this.video = this.$player = video;
				this.InstallPlayerPatches();
			}
		});
		observer.observe(document.documentElement, { childList: true, subtree: true });
	},

	InstallPlayerPatches() {
		const video = this.video;
		if(!video || video.__tchPatched)
			return;
		video.__tchPatched = true;

		// Force playback rate; the site's own controls may reset it.
		const applyRate = () => {
			try {
				video.playbackRate = this.currentRate ?? 10;
			} catch(err) {
				console.warn('[畅课 Hack] playbackRate failed', err);
			}
		};
		applyRate();
		video.addEventListener('ratechange', applyRate);

		// Opt-in: keep playing even when the site tries to auto-pause.
		// Off by default because blocking pause can interfere with the site's own
		// progress reporting.
		video.addEventListener('pause', () => {
			if(this.blockPause && !video.ended)
				video.play().catch(() => { });
		});

		// The site enforces `refuseForwardSeeking` (watched-range only), so an
		// automatic jump to the end is reverted and breaks progress reporting.
		// Auto-seek stays off; the video simply plays through at high speed.
		if(this.autoSeek) {
			const seekToEnd = () => {
				try {
					if(Number.isFinite(video.duration))
						video.currentTime = video.duration;
				} catch(err) {
					console.warn('[畅课 Hack] seek failed', err);
				}
			};
			video.addEventListener('loadeddata', () => Delay(100).then(seekToEnd));
		}
	},

	GetCurrentActivityId() {
		const fromHash = (location.hash.match(/#\/(\d+)/) || [])[1];
		if(fromHash)
			return parseInt(fromHash, 10);
		return this.statistics?.tags?.activity_id ?? null;
	},

	FindActivity(id) {
		return (this.activities || []).find(activity => String(activity.id) === String(id)) || null;
	},

	// Report a completed watch through the site's own statistics collector.
	// `st.track(activityType, actionType, tags, extra)` posts to
	// `{statistics.server}/api/online-videos?jwt=...` on current builds.
	ReportVideoProgress(progress) {
		const st = this.statistics;
		if(!st || typeof st.track !== 'function')
			return false;

		const activityId = this.GetCurrentActivityId();
		if(!activityId)
			return false;

		const activity = this.FindActivity(activityId);
		const upload = activity?.uploads?.[0];
		const meta = upload?.videos?.[0];
		const duration = Number.isFinite(progress)
			? progress
			: (meta?.duration ?? (this.video && Number.isFinite(this.video.duration) ? this.video.duration : 0));

		const tags = {
			course_id: this.course?.id,
			activity_id: activityId,
			upload_id: upload?.id,
		};

		try {
			st.track('online_video', 'play', tags, {
				start_at: 0,
				end_at: duration,
				duration,
			});
			return true;
		} catch(err) {
			console.warn('[畅课 Hack] progress report failed', err);
			return false;
		}
	},

	async FetchActivities(courseId) {
		const endpoints = [
			`/api/courses/${courseId}/activities?with_uploads=true`,
			`/api/courses/${courseId}/activities`,
		];
		for(const endpoint of endpoints) {
			try {
				const json = await PostAjax(endpoint, 'GET');
				const obj = JSON.parse(json);
				if(Array.isArray(obj?.activities))
					return obj.activities;
			} catch(err) {
				// fall through to the next candidate
			}
		}
		return [];
	},

	InstallTransactionPatch() {
		const service = this.transaction = page.elasticApm.serviceFactory.instances.TransactionService;
		if(service.__tchPatched)
			return;
		service.__tchPatched = true;
		service.__proto__.startTransaction = function(type, name, options) {
			const opts = this.createOptions(options);
			let transaction;
			let needStart = true;
			if(opts.managed) {
				transaction = this.startManagedTransaction(type, name, opts);
				if(this.currentTransaction === transaction)
					needStart = false;
			} else {
				transaction = new this.constructor(type, name, opts);
			}
			transaction.onEnd = () => this.handleTransactionEnd(transaction);
			transaction.outcome = true;
			if(needStart)
				this._config.events.send('transaction:start', [transaction]);
			return transaction;
		};
	},

	async PostVideoActivityProgress(activity, progress) {
		const upload = activity?.uploads?.[0];
		const video = upload?.videos?.[0];
		if(!video)
			return null;
		if(isNaN(progress))
			progress = video.duration;

		// Legacy statistics collector, still reachable on current builds.
		const payload = {
			action_type: 'play',
			activity_id: this.statistics?.tags?.activity_id ?? activity.id,
			comment_id: null,
			course_code: this.course.courseCode,
			course_id: this.course.id,
			course_name: this.course.name,
			dept_code: this.dept.code,
			dept_id: this.dept.id,
			dept_name: this.dept.name,
			is_teacher: false,
			master_course_id: 0,
			meeting_type: 'online_video',
			module_id: this.statistics?.tags?.module_id ?? null,
			org_code: this.user.orgCode,
			org_id: this.user.orgId,
			org_name: this.user.orgName,
			reply_id: null,
			user_agent: navigator.userAgent,
			user_id: this.user.id,
			user_name: this.user.name,
			user_no: this.user.userNo,
			ts: null,
			upload_id: upload.id,
			dutation: progress,
			start_at: 0,
			end_at: progress,
		};

		return await PostAjax(
			'/statistics/api/online-videos',
			'POST',
			{ 'Content-Type': 'text/plain;charset=utf-8' },
			JSON.stringify(payload)
		);
	},

	async ReadActivity(activityId, payload = {}) {
		return await SafePost(`/api/course/activities-read/${activityId}`, payload);
	},

	// The real progress-report endpoint, confirmed from the site's own traffic:
	//   POST /api/course/activities-read/{activityId}   body: {"start":0,"end":363}
	// `end` is the watched position in seconds (the video duration marks it complete).
	async PostActivityRead(activityId, start, end) {
		const json = await PostAjax(
			`/api/course/activities-read/${activityId}`,
			'POST',
			{ 'Content-Type': 'application/json' },
			JSON.stringify({ start, end })
		);
		return json;
	},

	async GetVideoDuration(activityId) {
		if(this.video && Number.isFinite(this.video.duration) && this.video.duration > 0)
			return Math.round(this.video.duration);
		const activity = this.FindActivity(activityId) || await this.FetchActivity(activityId);
		const meta = activity?.uploads?.[0]?.videos?.[0];
		return meta?.duration ? Math.round(meta.duration) : 0;
	},

	async FetchActivity(activityId) {
		try {
			const json = await PostAjax(`/api/activities/${activityId}`, 'GET');
			return JSON.parse(json);
		} catch(err) {
			return null;
		}
	},

	// Mark the current video as fully watched.
	// The server rejects any single report longer than MAX_CHUNK seconds
	// ("The set time duration is too long, maximum is 125s"), so the watch is
	// reported as contiguous chunks covering [0, duration].
	async CompleteCurrentVideo() {
		const activityId = this.GetCurrentActivityId();
		if(!activityId)
			return '未识别到当前活动 id';

		const duration = await this.GetVideoDuration(activityId);
		if(!duration)
			return '无法获取视频时长';

		const MAX_CHUNK = 120;
		const lines = [];
		for(let start = 0; start < duration; start += MAX_CHUNK) {
			const end = Math.min(start + MAX_CHUNK, duration);
			let resp;
			try {
				resp = await this.PostActivityRead(activityId, start, end);
			} catch(err) {
				resp = `请求异常：${err && err.message ? err.message : err}`;
			}
			const text = String(resp);
			lines.push(`${start}-${end}s ${text.includes('failed') ? '✗' : '✓'} ${text.slice(0, 120)}`);
			await Delay(400);
		}

		// Mirror the statistics beacon the site sends (no chunk limit there).
		try {
			this.ReportVideoProgress(duration);
		} catch(err) { /* ignore */ }

		return lines.join('\n');
	},

	// Build the panel body shown after a successful init.
	BuildPanel(hack) {
		const wrap = document.createElement('div');
		wrap.className = 'hack-body';

		const line = (label, value) => {
			const p = document.createElement('p');
			p.className = 'log';
			p.textContent = `${label}：${value}`;
			wrap.appendChild(p);
			return p;
		};

		line('课程', hack.course?.name ?? '未知');
		line('视频数', hack.videos?.length ?? 0);
		line('倍速', hack.currentRate ?? 10);

		const controls = document.createElement('div');
		controls.className = 'hack-controls';

		const complete = document.createElement('button');
		complete.textContent = '一键完成';
		complete.onclick = async () => {
			status.textContent = '上报中…';
			status.textContent = await hack.CompleteCurrentVideo();
		};
		controls.appendChild(complete);

		wrap.appendChild(controls);

		const status = document.createElement('p');
		status.className = 'log hack-status';
		status.textContent = '按 ≤120s 分段上报观看进度';
		wrap.appendChild(status);

		// Network capture: shows the requests the site actually sends so the
		// progress-report endpoint/payload can be identified.
		const sniffTitle = document.createElement('p');
		sniffTitle.className = 'log';
		wrap.appendChild(sniffTitle);

		const sniffBox = document.createElement('textarea');
		sniffBox.className = 'hack-capture';
		sniffBox.readOnly = true;
		sniffBox.spellcheck = false;
		wrap.appendChild(sniffBox);

		const buildText = () => (hack.captured || []).map(item =>
			`${item.at} ${item.method} ${item.url}\n`
			+ `  body: ${item.body || '(none)'}\n`
			+ `  resp: ${item.response || '(none)'}`
		).join('\n\n');

		const render = () => {
			sniffTitle.textContent = `—— 捕获的请求（${(hack.captured || []).length}）——`;
			const text = buildText();
			if(sniffBox.value !== text)
				sniffBox.value = text;
		};

		render();
		// Auto-refresh, but never while you are selecting text in the box.
		setInterval(() => {
			if(document.activeElement !== sniffBox)
				render();
		}, 2000);

		return [wrap];
	},
});

Hack.currentRate = 10;
Hack.blockPause = false;
Hack.autoSeek = false;
Hack.autoComplete = false;
Hack.Run(Hack.BuildPanel);

export default Hack;