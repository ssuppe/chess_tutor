"use client";

import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

export function KeyboardHandler() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const showListener = Keyboard.addListener('keyboardWillShow', info => {
            setKeyboardHeight(info.keyboardHeight);
            document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
        });

        const hideListener = Keyboard.addListener('keyboardWillHide', () => {
            setKeyboardHeight(0);
            document.documentElement.style.setProperty('--keyboard-height', '0px');
        });

        return () => {
            showListener.remove();
            hideListener.remove();
        };
    }, []);

    return null;
}
