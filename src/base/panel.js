import Style from './panel.css';

export default class Panel {
	constructor(tag = 'div') {
		this.element = document.createElement(tag);
		this.element.id = 'hack-panel';

		this.header = document.createElement('header');
		this.element.appendChild(this.header);

		this.content = document.createElement('main');
		this.element.appendChild(this.content);
	}

	SetHeader(text) {
		this.header.innerText = text;
	}

	Clear() {
		this.content.innerHTML = '';
	}

	Append(child) {
		if(child instanceof HTMLElement)
			this.content.appendChild(child);
		else if(child instanceof Panel)
			this.content.appendChild(child.element);
		else if(child != null)
			this.content.appendChild(document.createTextNode(String(child) + '\n'));
	}

	Layout(children) {
		if(children == null)
			return;
		if(Symbol.iterator in Object(children))
			for(const child of children)
				this.Append(child);
		else
			this.Append(children);
	}

	Log(text) {
		const p = document.createElement('p');
		p.classList.add('log');
		p.innerText = text;
		this.content.appendChild(p);
	}
}

void Style;