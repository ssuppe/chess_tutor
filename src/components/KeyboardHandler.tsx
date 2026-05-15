"use client";

import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

export function KeyboardHandler() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let showListener: any;
        let hideListener: any;

        const setupListeners = async () => {
            showListener = await Keyboard.addListener('keyboardWillShow', info => {
                setKeyboardHeight(info.keyboardHeight);
                document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
            });

            hideListener = await Keyboard.addListener('keyboardWillHide', () => {
                setKeyboardHeight(0);
                document.documentElement.style.setProperty('--keyboard-height', '0px');
            });
        };

        setupListeners();

        return () => {
            if (showListener) showListener.remove();
            if (hideListener) hideListener.remove();
        };
    }, []);

    return null;
}
