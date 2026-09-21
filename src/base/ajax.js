import _ from 'lodash';

export const page = (typeof unsafeWindow !== 'undefined' && unsafeWindow)
	|| (typeof window !== 'undefined' ? (window.wrappedJSObject || window) : null);

export function Delay(ms = 100) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function SetHeaders(xhr, headers) {
	if(!headers)
		return;
	for(const [key, value] of _.toPairs(headers))
		xhr.setRequestHeader(key, value);
}

export async function Ajax(url, method, headers, data, timeout) {
	const target = new URL(url.toString(), location.href);
	const xhr = new XMLHttpRequest();

	if(+timeout > 0)
		xhr.timeout = +timeout;

	switch(method) {
		case 'GET':
			if(data)
				for(const key in data)
					target.searchParams.append(key, data[key]);
			xhr.open(method, target.toString());
			SetHeaders(xhr, headers);
			xhr.send();
			break;
		case 'POST':
			xhr.open(method, target.toString());
			SetHeaders(xhr, headers);
			if(data)
				xhr.send(data);
			else
				xhr.send();
			break;
		default:
			throw new Error(`Unsupported method: ${method}`);
	}

	return await Promise.race([
		new Promise(resolve => xhr.ontimeout = () => resolve(Promise.reject(new Error('Request timed out')))),
		new Promise(resolve => xhr.onerror = err => resolve(Promise.reject(err))),
		new Promise(resolve => xhr.onload = () => resolve(xhr.response)),
	]);
}

export const PostAjax = (url, method, headers, data, timeout) => Ajax(url, method, headers, data, timeout);