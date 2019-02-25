import { ipcRenderer } from 'electron';
import attachEvents from './events';
import servers from './servers';
import sidebar from './sidebar';
import i18n from '../i18n';


const defaultInstance = 'https://open.rocket.chat';

async function setupLanding() {
	function updateConnectionStatus() {
		document.body.classList[navigator.onLine ? 'remove' : 'add']('offline');
	}
	window.addEventListener('online', updateConnectionStatus);
	window.addEventListener('offline', updateConnectionStatus);
	updateConnectionStatus();

	const form = document.querySelector('form');
	const hostField = form.querySelector('[name="host"]');
	const button = form.querySelector('[type="submit"]');
	const invalidUrl = form.querySelector('#invalidUrl');

	window.addEventListener('load', () => hostField.focus());

	let state = {};

	function setState(partialState) {
		state = [...state, ...partialState];
	}

	function validateHost() {
		return new Promise(function(resolve, reject) {
			const execValidation = async() => {
				invalidUrl.style.display = 'none';
				hostField.classList.remove('wrong');

				const host = hostField.value.trim();
				hostField.value = host;

				if (host.length === 0) {
					button.value = i18n.__('landing.connect');
					button.disabled = false;
					resolve();
					return;
				}

				button.value = i18n.__('landing.validating');
				button.disabled = true;

				try {
					await servers.validateHost(host, 2000);
					button.value = i18n.__('landing.connect');
					button.disabled = false;
					resolve();
				} catch (status) {
					// If the url begins with HTTP, mark as invalid
					if (/^https?:\/\/.+/.test(host) || status === 'basic-auth') {
						button.value = i18n.__('landing.invalidUrl');
						invalidUrl.style.display = 'block';
						switch (status) {
							case 'basic-auth':
								invalidUrl.innerHTML = i18n.__('error.authNeeded', { auth: 'username:password@host' });
								break;
							case 'invalid':
								invalidUrl.innerHTML = i18n.__('error.noValidServerFound');
								break;
							case 'timeout':
								invalidUrl.innerHTML = i18n.__('error.connectTimeout');
								break;
						}
						hostField.classList.add('wrong');
						reject();
						return;
					}

					// If the url isn't localhost, don't have dots and don't have protocol
					// try as a .rocket.chat subdomain
					if (!/(^https?:\/\/)|(\.)|(^([^:]+:[^@]+@)?localhost(:\d+)?$)/.test(host)) {
						hostField.value = `https://${ host }.rocket.chat`;
						return execValidation();
					}

					// If the url don't start with protocol try HTTPS
					if (!/^https?:\/\//.test(host)) {
						hostField.value = `https://${ host }`;
						return execValidation();
					}
				}
			};

			execValidation();
		});
	}

	hostField.addEventListener('blur', async() => {
		await validateHost();
	});

	ipcRenderer.on('certificate-reload', async(event, url) => {
		hostField.value = url.replace(/\/api\/info$/, '');
		await validateHost();
	});

	form.addEventListener('submit', async(event) => {
		event.preventDefault();
		event.stopPropagation();

		try {
			await validateHost();
			const input = form.querySelector('[name="host"]');
			let url = input.value;

			if (url.length === 0) {
				url = defaultInstance;
			}

			url = servers.addHost(url);
			if (url !== false) {
				sidebar.show();
				servers.setActive(url);
			}

			input.value = '';
		} catch (e) {
			console.error(e);
		}
	});
}

export async function start() {
	await i18n.initialize();
	await setupLanding();
	await attachEvents();
}
