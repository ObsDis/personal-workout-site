//
//  MacroWidgetBridge.m
//  Required Objective-C registration so Capacitor can find the Swift plugin.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MacroWidgetBridge, "MacroWidgetBridge",
    CAP_PLUGIN_METHOD(setMacros, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setTodayWorkout, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getActivityGoals, CAPPluginReturnPromise);
)
