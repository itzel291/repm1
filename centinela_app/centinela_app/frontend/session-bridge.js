(() => {
    const AUTH_KEYS = new Set([
        'token',
        'userId',
        'nombre',
        'usuarioActual',
        'numeroCasa',
        'rolActual',
        'email',
        'chatPrivadoCon',
    ]);

    const storageProto = Storage.prototype;
    const originalGetItem = storageProto.getItem;
    const originalSetItem = storageProto.setItem;
    const originalRemoveItem = storageProto.removeItem;
    const originalClear = storageProto.clear;

    function isLocalStorageTarget(target) {
        return target === window.localStorage;
    }

    function isAuthKey(key) {
        return typeof key === 'string' && AUTH_KEYS.has(key);
    }

    function migrateLegacyAuthState() {
        AUTH_KEYS.forEach((key) => {
            const sessionValue = originalGetItem.call(window.sessionStorage, key);
            const legacyValue = originalGetItem.call(window.localStorage, key);

            if (sessionValue === null && legacyValue !== null) {
                originalSetItem.call(window.sessionStorage, key, legacyValue);
            }

            if (legacyValue !== null) {
                originalRemoveItem.call(window.localStorage, key);
            }
        });
    }

    storageProto.getItem = function(key) {
        if (isLocalStorageTarget(this) && isAuthKey(key)) {
            const sessionValue = originalGetItem.call(window.sessionStorage, key);
            if (sessionValue !== null) {
                return sessionValue;
            }
        }

        return originalGetItem.call(this, key);
    };

    storageProto.setItem = function(key, value) {
        if (isLocalStorageTarget(this) && isAuthKey(key)) {
            originalSetItem.call(window.sessionStorage, key, value);
            originalRemoveItem.call(window.localStorage, key);
            return;
        }

        return originalSetItem.call(this, key, value);
    };

    storageProto.removeItem = function(key) {
        if (isLocalStorageTarget(this) && isAuthKey(key)) {
            originalRemoveItem.call(window.sessionStorage, key);
            originalRemoveItem.call(window.localStorage, key);
            return;
        }

        return originalRemoveItem.call(this, key);
    };

    storageProto.clear = function() {
        if (isLocalStorageTarget(this)) {
            AUTH_KEYS.forEach((key) => {
                originalRemoveItem.call(window.sessionStorage, key);
            });
        }

        return originalClear.call(this);
    };

    migrateLegacyAuthState();
})();
