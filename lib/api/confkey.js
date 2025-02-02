// Cronicle API Layer - Configs
// Copyright (c) 2015 Joseph Huckaby
// Released under the MIT License

const Class = require("pixl-class");
const Tools = require("pixl-tools");
const ld = require("lodash");

module.exports = Class.create({

	api_get_conf_keys: function (args, callback) {
		// get list of all conf_keys
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		this.loadSession(args, function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			self.storage.listGet('global/conf_keys', 0, 0, function (err, items, list) {
				if (err) {
					// no keys found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}

				// success, return keys and list header
				callback({ code: 0, rows: items, list: list });
			}); // got conf_key list
		}); // loaded session
	},

	validateKey: function(key) {
		if(typeof key !== 'string') return false 
		let qc = key.toUpperCase() 
		if (qc == 'SECRET_KEY' || qc == 'BASE_PATH' || qc.startsWith("STORAGE") || qc.startsWith("WEBSERVER")) return false
		return true
	},

	api_get_conf_key: function (args, callback) {
		// get single Config Key for editing
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;

		this.loadSession(args, function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			self.storage.listFind('global/conf_keys', { id: params.id }, function (err, item) {
				if (err || !item) {
					return self.doError('conf_key', "Failed to locate Config Key: " + params.id, callback);
				}

				// success, return key
				callback({ code: 0, conf_key: item });
			}); // got conf_key
		}); // loaded session
	},

	api_create_conf_key: function (args, callback) {
		// add new Config Key
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		if (!this.requireParams(params, {
			title: /\S/,
			key: /\S/
		}, callback)) return;

	    // make sure title doesn't contain HTML metacharacters
	    if (params.title && params.title.match(/[<>]/)) {
		  return this.doError('api', "Malformed title parameter: Cannot contain HTML metacharacters", callback);
	    }

		this.loadSession(args, async function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			args.user = user;
			args.session = session;

			params.id = self.getUniqueID('c');
			params.username = user.username;
			params.created = params.modified = Tools.timeNow(true);

			let conf_name = String(params.title).trim();
			if(!self.validateKey(conf_name)) return self.doError('conf_key', "This Config Name is not allowed", callback)

			params.title = conf_name

			if(typeof params.key === 'boolean') { }
			else if (params.key === 'true') params.key = true;
			else if (params.key === 'false') params.key = false;
			else if (params.key.match(/^\-?\d+$/)) params.key = parseInt(params.key);
			else if (params.key.match(/^\-?\d+\.\d+$/)) params.key = parseFloat(params.key);


			if (!params.description) params.description = "";

			// check if same title or id already exist
			let alreadyExist = await self.validateUnique('global/conf_keys', params, ["id", "title"])
			if (alreadyExist > 0) {
				return self.doError('conf_key', `Failed to create config key: (${params.title}) already exists`, callback);
			}

			self.logDebug(6, "Creating new Config Key: " + params.title, params);

			self.storage.listUnshift('global/conf_keys', params, function (err) {
				if (err) {
					return self.doError('conf_key', "Failed to create conf_key: " + err, callback);
				}

				ld.set(self.server.config.get(), params.title, params.key); // live update
				self.logDebug(6, "Successfully created conf_key: " + params.title, params);
				self.logTransaction('confkey_create', params.title, self.getClientInfo(args, { conf_key: params }));
				self.logActivity('confkey_create', { conf_key: params }, args);

				callback({ code: 0, id: params.id, key: params.key });

				// broadcast update to all websocket clients
				self.authSocketEmit('update', { conf_keys: {} });
			}); // list insert
		}); // load session
	},

	api_update_conf_key: function (args, callback) {
		// update existing Config Key
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
		}, callback)) return;

	    // make sure title doesn't contain HTML metacharacters
	    if (params.title && params.title.match(/[<>]/)) {
			return this.doError('api', "Malformed title parameter: Cannot contain HTML metacharacters", callback);
		}		

		this.loadSession(args, async function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			args.user = user;
			args.session = session;

			params.modified = Tools.timeNow(true);

			let conf_name = String(params.title).trim()
			if(!self.validateKey(conf_name)) return self.doError('conf_key', "This Config Name is not allowed", callback)

			if(typeof params.key === 'boolean') { }
			else if (params.key === 'true') params.key = true;
			else if (params.key === 'false') params.key = false;
			else if (params.key.match(/^\-?\d+$/)) params.key = parseInt(params.key);
			else if (params.key.match(/^\-?\d+\.\d+$/)) params.key = parseFloat(params.key);

			self.logDebug(6, "Updating Config Key: " + params.id, params);

			self.storage.listFindUpdate('global/conf_keys', { id: params.id, title: params.title }, params, function (err, conf_key) {
				if (err) {
					return self.doError('conf_key', "Failed to update Config Key: " + err, callback);
				}

				ld.set(self.server.config.get(), params.title, params.key); // live update
				self.logDebug(6, "Successfully updated Config Key: " + conf_key.title, params);
				self.logTransaction('confkey_update', conf_key.title, self.getClientInfo(args, { conf_key: conf_key }));
				self.logActivity('confkey_update', { conf_key: conf_key }, args);

				callback({ code: 0 });

				// broadcast update to all websocket clients
				self.authSocketEmit('update', { conf_keys: {} });
			});
		});
	},

	api_delete_conf_key: function (args, callback) {
		// delete existing Config Key
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;

		this.loadSession(args, function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			args.user = user;
			args.session = session;

			self.logDebug(6, "Deleting Config Key: " + params.id, params);

			self.storage.listFindDelete('global/conf_keys', { id: params.id }, function (err, conf_key) {
				if (err) {
					return self.doError('conf_key', "Failed to delete Config Key: " + err, callback);
				}

				ld.unset(self.server.config.get(), params.title); // live update
				self.logDebug(6, "Successfully deleted Config Key: " + conf_key.title, conf_key);
				self.logTransaction('confkey_delete', conf_key.title, self.getClientInfo(args, { conf_key: conf_key }));
				self.logActivity('confkey_delete', { conf_key: conf_key }, args);



				callback({ code: 0 });

				// broadcast update to all websocket clients
				self.authSocketEmit('update', { conf_keys: {} });
			});
		});
	},

	// reload all configs
	api_reload_conf_key: function (args, callback) {
		const self = this;
		let params = args.params;
		if (!this.requiremanager(args, callback)) return;

		this.loadSession(args, function (err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;

			args.user = user;
			args.session = session;

			self.logDebug(6, "Reloading Configs: ", params);

			let config = self.server.config.get()

			self.storage.listGet('global/conf_keys', 0, 0, function (err, items, list) {
				if (err) {
					return self.doError('conf_key', "Failed to reload Configs: " + err, callback);
				}
				if (items) { // items only would exist on master 
					for (i = 0; i < items.length; i++) {
						if(!self.validateKey(items[i].title)) continue // skip forbidden keys				
						ld.set(config, items[i].title, items[i].key);
					}
				}

				self.logDebug(6, "Successfully Reloaded Configs: ");

				callback({ code: 0 });

				// broadcast update to all websocket clients
				self.authSocketEmit('update', { conf_keys: {} });
			});
		});
	}

});
